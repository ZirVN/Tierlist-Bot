const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { addVerifiedUser, isUserVerified, getVerifiedUser, getModeTest } = require('../database');
const { VERIFY_ROLE_ID, COOLDOWN_HOURS } = require('../config');

const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

async function getCooldownRemaining(userId, mode) {
  const modeTest = await getModeTest(userId, mode);
  if (!modeTest || !modeTest.last_tested_at) return 0;
  const elapsed = Date.now() - modeTest.last_tested_at;
  return COOLDOWN_MS - elapsed;
}

function formatDuration(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days} ngày ${remHours} giờ ${minutes} phút`;
  return `${hours} giờ ${minutes} phút`;
}

function createVerifyPanel() {
  const title = new TextDisplayBuilder().setContent(
    '### 📝 Hàng Chờ Đánh Giá Kiểm Tra\n\nSau khi đăng ký, bạn sẽ được thêm vào một kênh danh sách chờ.\nTại đây bạn sẽ được ping khi có tester ở khu vực của bạn sẵn sàng hỗ trợ.\nNếu bạn từ HT3 trở lên, một ticket ưu tiên sẽ được tạo riêng.\n\n• Khu vực cần chọn phải tương ứng với máy chủ mà bạn muốn thực hiện test.\n\n• Tên tài khoản (username) phải là tên bạn sẽ dùng để test.\n\n🚫 **Cung cấp sai thông tin sẽ khiến bài test bị từ chối.**'
  );
  const separator = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Large);

  const verifyBtn = new ButtonBuilder()
    .setCustomId('verify_btn')
    .setLabel('Xác Thực Tài Khoản')
    .setStyle(ButtonStyle.Primary);

  const queueBtn = new ButtonBuilder()
    .setCustomId('queue_btn')
    .setLabel('Vào Hàng Chờ')
    .setStyle(ButtonStyle.Primary);

  const cooldownBtn = new ButtonBuilder()
    .setCustomId('cooldown_btn')
    .setLabel('Xem Cooldown')
    .setStyle(ButtonStyle.Primary);

  const buttonRow = new ActionRowBuilder().addComponents(verifyBtn, queueBtn, cooldownBtn);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(title)
    .addSeparatorComponents(separator)
    .addActionRowComponents(buttonRow);

  return container;
}

async function sendVerifyPanel(interaction) {
  const container = createVerifyPanel();
  await interaction.reply({
    content: '📋 Panel xác thực đã được gửi!',
    flags: MessageFlags.Ephemeral
  });
  await interaction.channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });
}

function createVerifyModal() {
  const modal = new ModalBuilder()
    .setCustomId('verify_modal')
    .setTitle('Xác thực tài khoản game');

  const nameInput = new TextInputBuilder()
    .setCustomId('game_name_input')
    .setLabel('Tên tài khoản game')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Nhập tên tài khoản của bạn')
    .setRequired(true);
  const nameRow = new ActionRowBuilder().addComponents(nameInput);
  modal.addComponents(nameRow);

  const premiumRadio = {
    type: 21,
    custom_id: 'premium_radio',
    options: [
      { label: 'Premium', value: 'premium' },
      { label: 'Crack', value: 'crack' }
    ]
  };
  const premiumLabel = {
    type: 18,
    label: 'Loại tài khoản',
    component: premiumRadio
  };
  modal.addComponents(premiumLabel);

  const regionRadio = {
    type: 21,
    custom_id: 'region_radio',
    options: [
      { label: 'Miền Bắc', value: 'Miền Bắc' },
      { label: 'Miền Trung', value: 'Miền Trung' },
      { label: 'Miền Nam', value: 'Miền Nam' }
    ]
  };
  const regionLabel = {
    type: 18,
    label: 'Khu vực',
    component: regionRadio
  };
  modal.addComponents(regionLabel);

  return modal;
}

function createResultContainer(gameName, isPremium, region, nicknameChanged) {
  const title = new TextDisplayBuilder().setContent(
    `## ✅ Xác thực thành công!\n- **Tài khoản:** ${gameName}\n- **Loại:** ${isPremium ? 'Premium' : 'Crack'}\n- **Khu vực:** ${region}`
  );
  const separator = new SeparatorBuilder().setDivider(true);
  const nicknameMsg = nicknameChanged
    ? '🎉 Bạn đã được đổi tên thành tên game và cấp role Verify.'
    : '⚠️ Không thể đổi nickname do thiếu quyền. Vui lòng liên hệ Admin để cập nhật tên. Bạn vẫn được cấp role Verify.';
  const footer = new TextDisplayBuilder().setContent(nicknameMsg);

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(title)
    .addSeparatorComponents(separator)
    .addTextDisplayComponents(footer);

  return container;
}

async function handleVerifyModal(interaction) {
  const userId = interaction.user.id;
  const member = interaction.member;

  if (member.roles.cache.has(VERIFY_ROLE_ID)) {
    return interaction.reply({
      content: '❌ Bạn đã xác thực trước đó. Không thể xác thực lại.',
      flags: MessageFlags.Ephemeral
    });
  }

  const gameName = interaction.fields.getTextInputValue('game_name_input');
  const premiumValue = interaction.fields.getField('premium_radio')?.value;
  const regionValue = interaction.fields.getField('region_radio')?.value;

  if (!gameName || !premiumValue || !regionValue) {
    return interaction.reply({
      content: '❌ Vui lòng điền đầy đủ thông tin.',
      flags: MessageFlags.Ephemeral
    });
  }

  const isPremium = premiumValue === 'premium';

  try {
    await addVerifiedUser(userId, gameName, isPremium, regionValue);
  } catch (err) {
    console.error('Lỗi lưu verify:', err);
    return interaction.reply({
      content: '❌ Đã xảy ra lỗi khi xác thực, vui lòng thử lại sau.',
      flags: MessageFlags.Ephemeral
    });
  }

  let roleAdded = false;
  try {
    await member.roles.add(VERIFY_ROLE_ID);
    roleAdded = true;
  } catch (err) {
    console.error('Không thể cấp role verify:', err);
    return interaction.reply({
      content: '❌ Không thể cấp role verify. Vui lòng kiểm tra quyền của bot.',
      flags: MessageFlags.Ephemeral
    });
  }

  let nicknameChanged = false;
  try {
    const botMember = interaction.guild.members.me;
    const botRole = botMember.roles.highest;
    const memberRole = member.roles.highest;

    if (
      botMember.permissions.has('ManageNicknames') &&
      botRole.position > memberRole.position
    ) {
      await member.setNickname(gameName);
      nicknameChanged = true;
    } else {
      console.warn('Bot thiếu quyền ManageNicknames hoặc role không đủ cao để đổi nickname.');
    }
  } catch (err) {
    console.warn('Không thể đổi nickname:', err.message);
  }

  const container = createResultContainer(gameName, isPremium, regionValue, nicknameChanged);
  await interaction.reply({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
  });
}

async function handleQueueButton(interaction) {
  const member = interaction.member;

  if (!member.roles.cache.has(VERIFY_ROLE_ID)) {
    return interaction.reply({
      content: '❌ Bạn chưa xác thực tài khoản. Vui lòng xác thực trước khi tham gia chờ.',
      flags: MessageFlags.Ephemeral
    });
  }

  const { createQueueModal } = require('./queue');
  const modal = createQueueModal();
  await interaction.showModal(modal);
}

async function handleCooldownButton(interaction) {
  const { MODES } = require('../config');
  const userId = interaction.user.id;

  const cooldowns = [];
  for (const mode of MODES) {
    const remaining = await getCooldownRemaining(userId, mode);
    if (remaining > 0) {
      cooldowns.push(`• **${mode}**: còn ${formatDuration(remaining)}`);
    }
  }

  if (cooldowns.length === 0) {
    return interaction.reply({
      content: '✅ Bạn không có cooldown ở mode nào. Có thể vào hàng chờ ngay!',
      flags: MessageFlags.Ephemeral
    });
  }

  return interaction.reply({
    content: `⏳ Cooldown hiện tại của bạn (theo từng mode):\n${cooldowns.join('\n')}`,
    flags: MessageFlags.Ephemeral
  });
}

module.exports = {
  createVerifyPanel,
  sendVerifyPanel,
  createVerifyModal,
  handleVerifyModal,
  handleQueueButton,
  handleCooldownButton,
  getCooldownRemaining,
  formatDuration
};