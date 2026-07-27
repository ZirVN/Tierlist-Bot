const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
} = require('discord.js');
const { getVerifiedUser, updateModeTier, getModeTest } = require('../database');
const { getCooldownRemaining, formatDuration } = require('./verify');
const { MODES, TIERS, testerRoles, tierRoles, waitlistRoles, RESULTS_CHANNEL_ID } = require('../config');

const queues = {};
const activeTests = {};
const queueMessages = {};
const queueFrontNotified = {};

const RESULT_REACTIONS = ['👑', '🎉', '😭', '😢', '😂', '💀'];

async function notifyIfFrontChanged(mode) {
  const queue = queues[mode];
  if (!queue) return;

  const front = queue.length ? queue[0] : null;

  if (!front) {
    queueFrontNotified[mode] = null;
    return;
  }

  if (queueFrontNotified[mode] === front) return;
  queueFrontNotified[mode] = front;

  try {
    const user = await global.client.users.fetch(front);
    await user.send(
      `🔔 Bạn đang ở vị trí **#1** trong hàng chờ mode **${mode}**!\n` +
      `Sắp đến lượt bạn được test — vui lòng chuẩn bị sẵn sàng và để ý tin nhắn/ping từ tester nhé.`
    );
  } catch (err) {
    console.warn(`⚠️ Không thể gửi DM nhắc "sắp đến lượt" tới ${front}:`, err.message);
  }
}

function canManageQueue(member, mode) {
  if (member.permissions.has('Administrator')) return true;
  const roleId = testerRoles[mode];
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

const MAX_QUEUE_SIZE = 20;
const MAX_ACTIVE_TICKETS = 2;

function createWaitlistPanels(mode, queue, testerId, activeTicketCount = 0) {
  const separator = new SeparatorBuilder().setDivider(true);

  const statusLine = new TextDisplayBuilder().setContent(
    `🟢 **Queue ${mode} — Đang mở!**`
  );

  const listItems = queue.length
    ? queue.map((id, index) => `${index + 1}. <@${id}>`).join('\n')
    : '*(trống)*';
  const listDisplay = new TextDisplayBuilder().setContent(listItems);

  const infoText = new TextDisplayBuilder().setContent(
    `**Tester:** ${testerId ? `<@${testerId}>` : '*(chưa có)*'}\n` +
    `Tối đa ${MAX_QUEUE_SIZE} người | Active tickets: ${activeTicketCount}/${MAX_ACTIVE_TICKETS}`
  );

  const joinBtn = new ButtonBuilder()
    .setCustomId(`queue_join_${mode}`)
    .setLabel('Join')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);
  const leaveBtn = new ButtonBuilder()
    .setCustomId(`queue_leave_${mode}`)
    .setLabel('Leave')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger);
  const pullBtn = new ButtonBuilder()
    .setCustomId(`queue_next_${mode}`)
    .setLabel('Pull')
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Primary);
  const endBtn = new ButtonBuilder()
    .setCustomId(`queue_end_${mode}`)
    .setLabel('Kết thúc')
    .setEmoji('🔚')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder().addComponents(joinBtn, leaveBtn, pullBtn, endBtn);

  const controlContainer = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(statusLine)
    .addSeparatorComponents(separator)
    .addTextDisplayComponents(listDisplay)
    .addSeparatorComponents(separator)
    .addTextDisplayComponents(infoText)
    .addActionRowComponents(actionRow);

  const listContainer = controlContainer;

  return { controlContainer, listContainer };
}

async function openQueue(interaction, mode) {
  if (!canManageQueue(interaction.member, mode)) {
    return interaction.reply({
      content: `❌ Bạn không có quyền mở waitlist cho mode ${mode}. Cần role tester tương ứng hoặc quyền Admin.`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (!Object.keys(waitlistRoles).includes(mode)) {
    return interaction.reply({
      content: `❌ Mode không hợp lệ. Các mode hợp lệ: ${Object.keys(waitlistRoles).join(', ')}`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (queues[mode]) {
    return interaction.reply({
      content: `⚠️ Waitlist cho mode **${mode}** đã được mở trước đó.`,
      flags: MessageFlags.Ephemeral
    });
  }

  queues[mode] = [];

  const { controlContainer } = createWaitlistPanels(mode, queues[mode], interaction.user.id, 0);

  const announceText = new TextDisplayBuilder().setContent(
    `@here Queue **${mode}** đã mở! Nhấn **Join** để vào hàng.`
  );
  controlContainer.spliceComponents(0, 0, announceText);

  const controlMsg = await interaction.channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [controlContainer]
  });

  queueMessages[mode] = {
    controlMsgId: controlMsg.id,
    channelId: interaction.channel.id,
    testerId: interaction.user.id,
  };

  await interaction.reply({
    content: `📢 Đã mở queue cho mode **${mode}**!`,
    flags: MessageFlags.Ephemeral
  });
}

async function updateList(mode) {
  const msgInfo = queueMessages[mode];
  if (!msgInfo) return;

  const channel = await global.client.channels.fetch(msgInfo.channelId);
  if (!channel) return;

  const controlMsg = await channel.messages.fetch(msgInfo.controlMsgId).catch(() => null);
  if (!controlMsg) return;

  const queue = queues[mode] || [];
  const activeTicketCount = activeTests[mode] ? 1 : 0;
  const { controlContainer } = createWaitlistPanels(mode, queue, msgInfo.testerId, activeTicketCount);
  await controlMsg.edit({
    flags: MessageFlags.IsComponentsV2,
    components: [controlContainer]
  });
}

async function deleteQueueMessages(mode) {
  const msgInfo = queueMessages[mode];
  if (!msgInfo) return;

  const channel = await global.client.channels.fetch(msgInfo.channelId);
  if (!channel) return;

  const controlMsg = await channel.messages.fetch(msgInfo.controlMsgId).catch(() => null);
  if (controlMsg) await controlMsg.delete().catch(() => { });

  delete queueMessages[mode];
}

async function handleQueueButton(interaction) {
  await interaction.deferUpdate();

  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[1];
  const mode = parts.slice(2).join('_');

  if (!mode || !queues[mode]) {
    return interaction.followUp({
      content: '❌ Hàng đợi này không tồn tại hoặc đã kết thúc.',
      ephemeral: true
    });
  }

  const userId = interaction.user.id;
  const member = interaction.member;

  if (action === 'join') {
    const verified = await getVerifiedUser(userId);
    if (!verified) {
      return interaction.followUp({
        content: '❌ Bạn chưa xác thực tài khoản. Vui lòng xác thực trước.',
        ephemeral: true
      });
    }
    const remaining = await getCooldownRemaining(userId, mode);
    if (remaining > 0) {
      return interaction.followUp({
        content: `⏳ Bạn đang trong thời gian cooldown cho mode **${mode}**, còn **${formatDuration(remaining)}** nữa mới có thể test lại mode này.`,
        ephemeral: true
      });
    }
    if (queues[mode].includes(userId)) {
      return interaction.followUp({
        content: '⚠️ Bạn đã có trong danh sách.',
        ephemeral: true
      });
    }
    queues[mode].push(userId);
    await updateList(mode);
    await notifyIfFrontChanged(mode);
    return interaction.followUp({
      content: '✅ Bạn đã tham gia waitlist.',
      ephemeral: true
    });
  }

  if (action === 'leave') {
    const index = queues[mode].indexOf(userId);
    if (index === -1) {
      return interaction.followUp({
        content: '❌ Bạn không có trong danh sách.',
        ephemeral: true
      });
    }
    queues[mode].splice(index, 1);
    await updateList(mode);
    await notifyIfFrontChanged(mode);
    return interaction.followUp({
      content: '✅ Bạn đã rời khỏi waitlist.',
      ephemeral: true
    });
  }

  if (action === 'next' || action === 'end') {
    if (!canManageQueue(member, mode)) {
      return interaction.followUp({
        content: `❌ Bạn không có quyền thực hiện hành động này với mode ${mode}. Cần role tester tương ứng hoặc Admin.`,
        ephemeral: true
      });
    }
  }

  if (action === 'next') {
    if (queues[mode].length === 0) {
      return interaction.followUp({
        content: '❌ Không có ai trong hàng đợi.',
        ephemeral: true
      });
    }
    const targetUserId = queues[mode].shift();
    await updateList(mode);
    await notifyIfFrontChanged(mode);

    const userData = await getVerifiedUser(targetUserId);
    if (!userData) {
      return interaction.followUp({
        content: '❌ Không tìm thấy thông tin người chơi này.',
        ephemeral: true
      });
    }

    const previousModeTest = await getModeTest(targetUserId, mode);

    const thread = await interaction.channel.threads.create({
      name: `Test ${userData.game_name} (${mode})`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
      type: 12,
      invitable: false,
    });
    await thread.members.add(interaction.user.id);
    await thread.members.add(targetUserId);

    activeTests[mode] = {
      threadId: thread.id,
      testerId: interaction.user.id,
      userId: targetUserId,
      game_name: userData.game_name,
      isPremium: userData.is_premium,
      region: userData.region,
      previousTier: (previousModeTest && previousModeTest.tier) || 'Unranked',
    };

    const infoContainer = createTestInfoContainer(userData, mode);
    await thread.send({
      flags: MessageFlags.IsComponentsV2,
      components: [infoContainer],
    });

    return interaction.followUp({
      content: `🎫 Đã kéo vé, tạo thread <#${thread.id}> và mời <@${targetUserId}> vào test.`,
      ephemeral: true
    });
  }

  if (action === 'end') {
    delete queues[mode];
    delete queueFrontNotified[mode];
    await deleteQueueMessages(mode);
    if (activeTests[mode]) {
      const thread = interaction.guild.channels.cache.get(activeTests[mode].threadId);
      if (thread) await thread.delete();
      delete activeTests[mode];
    }
    await interaction.followUp({
      content: `🔚 Đã kết thúc waitlist mode ${mode}.`,
      ephemeral: true
    });

    const closedContainer = createQueueClosedContainer(mode);
    await interaction.channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [closedContainer],
    });
    return;
  }
}

function createQueueClosedContainer(mode) {
  const now = new Date();
  const formattedDate = now.toLocaleString('vi-VN', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const title = new TextDisplayBuilder().setContent(
    `### 🔴 [1.21+] Cộng Đồng PvP Minecraft — ${mode}\n\n` +
    `**Không Có Tester Online**\n\n` +
    `Hiện không có tester nào cho khu vực của bạn.\n` +
    `Bạn sẽ được ping khi có tester sẵn sàng.\n` +
    `Vui lòng quay lại sau!\n\n` +
    `Phiên test gần nhất: ${formattedDate}`
  );

  return new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(title);
}

function createTestInfoContainer(userData, mode) {
  const title = new TextDisplayBuilder().setContent(
    `## 🧪 Thông tin người chơi cần test\n- **Tên:** ${userData.game_name}\n- **Loại:** ${userData.is_premium ? 'Premium' : 'Crack'}\n- **Vùng:** ${userData.region}`
  );
  const separator = new SeparatorBuilder().setDivider(true);
  const footer = new TextDisplayBuilder().setContent(`Mode: ${mode}`);
  const container = new ContainerBuilder()
    .setAccentColor(0xF1C40F)
    .addTextDisplayComponents(title)
    .addSeparatorComponents(separator)
    .addTextDisplayComponents(footer);
  return container;
}

async function handleResults(interaction, tier, mode) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel;
  if (!channel.isThread()) {
    return interaction.editReply({
      content: '❌ Lệnh này chỉ sử dụng trong thread được tạo bởi bot.',
    });
  }

  const activeTest = activeTests[mode];
  if (!activeTest || activeTest.threadId !== channel.id) {
    return interaction.editReply({
      content: '❌ Không tìm thấy test đang chạy với mode này trong thread hiện tại.',
    });
  }

  if (!canManageQueue(interaction.member, mode)) {
    return interaction.editReply({
      content: `❌ Bạn không có quyền gửi kết quả cho mode ${mode}. Cần role tester tương ứng hoặc Admin.`,
    });
  }

  const tierRolesMap = tierRoles[tier];
  if (!tierRolesMap) {
    return interaction.editReply({
      content: `❌ Tier không hợp lệ. Các tier: ${Object.keys(tierRoles).join(', ')}`,
    });
  }

  const roleId = tierRolesMap[mode];
  if (!roleId) {
    return interaction.editReply({
      content: `❌ Không tìm thấy role cho mode ${mode} trong tier ${tier}.`,
    });
  }

  const targetMember = await interaction.guild.members.fetch(activeTest.userId);
  if (!targetMember) {
    return interaction.editReply({
      content: '❌ Không tìm thấy thành viên.',
    });
  }

  try {
    await targetMember.roles.add(roleId);
  } catch (err) {
    console.error('Không thể cấp role:', err);
    return interaction.editReply({
      content: '❌ Không thể cấp role. Kiểm tra quyền bot.',
    });
  }

  const waitlistRoleId = waitlistRoles[mode];
  if (waitlistRoleId && targetMember.roles.cache.has(waitlistRoleId)) {
    try {
      await targetMember.roles.remove(waitlistRoleId);
    } catch (err) {
      console.error('Không thể gỡ role waitlist:', err);
    }
  }

  try {
    await updateModeTier(activeTest.userId, mode, tier);
  } catch (err) {
    console.error('Không thể lưu tier vào database:', err);
  }

  const resultEmbed = createResultEmbed(activeTest, tier, mode);

  let resultsChannel;
  try {
    resultsChannel = await interaction.guild.channels.fetch(RESULTS_CHANNEL_ID);
    if (!resultsChannel) {
      return interaction.editReply({
        content: '❌ Không tìm thấy kênh results. Vui lòng kiểm tra ID kênh.',
      });
    }
  } catch (err) {
    console.error('Lỗi fetch kênh results:', err);
    return interaction.editReply({
      content: '❌ Không thể tìm kênh results. Kiểm tra bot có quyền xem kênh này.',
    });
  }

  const resultMsg = await resultsChannel.send({
    content: `<@${activeTest.userId}>`,
    embeds: [resultEmbed],
  });

  for (const emoji of RESULT_REACTIONS) {
    try {
      await resultMsg.react(emoji);
    } catch (err) {
      console.warn(`⚠️ Không thể thả reaction ${emoji}:`, err.message);
    }
  }

  delete activeTests[mode];
  await channel.delete();
}

function tierToVietnamese(tier) {
  if (!tier || tier === 'Unranked') return 'Chưa Xếp Hạng';
  const level = tier.slice(2);
  const prefix = tier.startsWith('HT') ? 'High Tier' : 'Low Tier';
  return `${prefix} ${level}`;
}

function createResultEmbed(activeTest, tier, mode) {
  const rankEarnedText = tierToVietnamese(tier);
  const previousRankText = tierToVietnamese(activeTest.previousTier);

  const playerName = activeTest.game_name;
  const avatarUrl = `https://render.crafty.gg/3d/bust/${encodeURIComponent(playerName)}`;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(`${playerName}'s Kết quả! 🏆`)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: 'Tester:', value: `<@${activeTest.testerId}>` },
      { name: 'Vùng:', value: activeTest.region },
      { name: 'Tên:', value: playerName },
      { name: 'Hạng trước đó:', value: previousRankText },
      { name: 'Hạng nhận được:', value: rankEarnedText },
    )
    .setFooter({ text: `Chế độ: ${mode} • Soki Tierlist` })
    .setTimestamp();

  return embed;
}

module.exports = {
  openQueue,
  handleQueueButton,
  handleResults,
};