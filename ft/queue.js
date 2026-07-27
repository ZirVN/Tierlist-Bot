const {
  ModalBuilder,
  MessageFlags,
} = require('discord.js');
const { MODES, waitlistRoles } = require('../config');
const { isUserVerified, getVerifiedUser } = require('../database');
const { getCooldownRemaining, formatDuration } = require('./verify');

function createQueueModal() {
  const modal = new ModalBuilder()
    .setCustomId('queue_modal')
    .setTitle('⏳ Chọn chế độ chờ');

  const modeOptions = MODES.map(mode => ({
    label: mode,
    value: mode
  }));

  const modeRadioRaw = {
    type: 21,
    custom_id: 'mode_radio',
    options: modeOptions
  };
  const modeLabelRaw = {
    type: 18,
    label: 'Chọn mode',
    description: 'Chọn chế độ bạn muốn tham gia',
    component: modeRadioRaw
  };
  modal.addComponents(modeLabelRaw);

  return modal;
}

async function handleQueueModal(interaction) {
  const mode = interaction.fields.getField('mode_radio')?.value;
  if (!mode) {
    return interaction.reply({
      content: '❌ Bạn chưa chọn mode.',
      flags: MessageFlags.Ephemeral
    });
  }

  const userData = await getVerifiedUser(interaction.user.id);
  if (!userData) {
    return interaction.reply({
      content: '❌ Bạn chưa xác thực tài khoản.',
      flags: MessageFlags.Ephemeral
    });
  }

  const remaining = await getCooldownRemaining(interaction.user.id, mode);
  if (remaining > 0) {
    return interaction.reply({
      content: `⏳ Bạn đang trong thời gian cooldown cho mode **${mode}**, còn **${formatDuration(remaining)}** nữa mới có thể test lại mode này.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const roleId = waitlistRoles[mode];
  if (!roleId) {
    return interaction.reply({
      content: '❌ Mode không hợp lệ.',
      flags: MessageFlags.Ephemeral
    });
  }

  const member = interaction.member;
  if (!member) {
    return interaction.reply({
      content: '❌ Không thể lấy thông tin thành viên.',
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    await member.roles.add(roleId);
    await interaction.reply({
      content: `✅ Bạn đã tham gia chờ thành công với mode **${mode}**!`,
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('Lỗi gán role:', err);
    await interaction.reply({
      content: '❌ Không thể gán role. Vui lòng kiểm tra quyền của bot.',
      flags: MessageFlags.Ephemeral
    });
  }
}

module.exports = {
  createQueueModal,
  handleQueueModal
};