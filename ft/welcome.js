const { EmbedBuilder } = require('discord.js');
const { WELCOME_CHANNEL_ID } = require('../config');

function createWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`👋 Chào mừng đến với ${member.guild.name}!`)
    .setDescription(
      'Cảm ơn bạn đã tham gia server!\n\n' +
      '📋 **Bước 1 — Xác thực tài khoản:**\n' +
      'Vào kênh xác thực trong server và nhấn nút **"Xác Thực Tài Khoản"** để đăng ký tên tài khoản game (username) bạn sẽ dùng để test.\n\n' +
      '⏳ **Bước 2 — Chế độ hàng chờ (Waitlist):**\n' +
      'Sau khi xác thực, nhấn **"Vào Hàng Chờ"** để tham gia danh sách chờ cho khu vực/mode của bạn.\n' +
      'Khi có tester sẵn sàng, bạn sẽ được thêm vào hàng đợi. Nếu bạn lên vị trí **#1** (sắp đến lượt), bot sẽ nhắn tin riêng nhắc bạn chuẩn bị.\n\n' +
      '🚫 **Lưu ý:** Cung cấp sai thông tin (tên tài khoản/khu vực) sẽ khiến bài test bị từ chối.'
    )
    .setFooter({ text: 'Soki Tierlist' })
    .setTimestamp();
}

async function handleGuildMemberAdd(member) {
  if (member.user?.bot) return;

  const embed = createWelcomeEmbed(member);

  try {
    await member.send({ embeds: [embed] });
  } catch (err) {
    if (!WELCOME_CHANNEL_ID) {
      console.warn('⚠️ Không thể gửi DM chào mừng (user tắt DM) và WELCOME_CHANNEL_ID chưa được cấu hình trong .env.');
      return;
    }
    try {
      const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
      if (channel) {
        await channel.send({
          content:
            `👋 <@${member.id}> Chào mừng bạn đến server! Mình không thể gửi tin nhắn riêng (DM) hướng dẫn xác thực cho bạn.\n` +
            `Vui lòng vào **Cài đặt quyền riêng tư** (Privacy Settings) của server và bật **"Cho phép tin nhắn riêng từ thành viên server"**, sau đó dùng nút xác thực trong kênh xác thực nhé.`,
        });
      }
    } catch (channelErr) {
      console.error('❌ Không thể gửi thông báo nhắc bật DM vào kênh chung:', channelErr);
    }
  }
}

module.exports = {
  createWelcomeEmbed,
  handleGuildMemberAdd,
};
