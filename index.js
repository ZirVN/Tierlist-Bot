require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Thiếu BOT_TOKEN hoặc CLIENT_ID trong file .env. Vui lòng kiểm tra lại.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const { sendVerifyPanel, createVerifyModal, handleVerifyModal, handleQueueButton, handleCooldownButton } = require('./ft/verify');
const { handleQueueModal } = require('./ft/queue');
const { openQueue, handleQueueButton: handleTesterQueueButton, handleResults } = require('./ft/tester');
const { handleGuildMemberAdd } = require('./ft/welcome');

const commands = [
  new SlashCommandBuilder()
    .setName('verify-panel')
    .setDescription('Gửi panel xác thực vào kênh hiện tại (Admin)'),
  new SlashCommandBuilder()
    .setName('queue-open')
    .setDescription('Mở waitlist cho mode cụ thể (Tester/Staff)')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Chọn mode')
        .setRequired(true)
        .addChoices(
          { name: 'Crystal', value: 'Crystal' },
          { name: 'Sword', value: 'Sword' },
          { name: 'Mace', value: 'Mace' },
          { name: 'Netheritepot', value: 'Netheritepot' },
          { name: 'Axenshield', value: 'Axenshield' },
          { name: 'Pot', value: 'Pot' },
          { name: 'Vanilla', value: 'Vanilla' },
          { name: 'SMP', value: 'SMP' },
          { name: 'UHC', value: 'UHC' }
        )),
  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Gửi kết quả test và cấp tier (dùng trong thread)')
    .addStringOption(option =>
      option.setName('tier')
        .setDescription('Chọn tier')
        .setRequired(true)
        .addChoices(
          { name: 'HT1', value: 'HT1' },
          { name: 'LT1', value: 'LT1' },
          { name: 'HT2', value: 'HT2' },
          { name: 'LT2', value: 'LT2' },
          { name: 'HT3', value: 'HT3' },
          { name: 'LT3', value: 'LT3' },
          { name: 'HT4', value: 'HT4' },
          { name: 'LT4', value: 'LT4' },
          { name: 'HT5', value: 'HT5' },
          { name: 'LT5', value: 'LT5' }
        ))
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Chọn mode')
        .setRequired(true)
        .addChoices(
          { name: 'Crystal', value: 'Crystal' },
          { name: 'Sword', value: 'Sword' },
          { name: 'Mace', value: 'Mace' },
          { name: 'Netheritepot', value: 'Netheritepot' },
          { name: 'Axenshield', value: 'Axenshield' },
          { name: 'Pot', value: 'Pot' },
          { name: 'Vanilla', value: 'Vanilla' },
          { name: 'SMP', value: 'SMP' },
          { name: 'UHC', value: 'UHC' }
        )),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      console.log(`🔄 Đang đăng ký lệnh slash cho server ${GUILD_ID} (nhanh, chỉ dùng để test)...`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log('✅ Các lệnh slash đã được đăng ký cho server test! (hiện gần như ngay lập tức)');
    } else {
      console.log('🔄 Đang đăng ký lệnh slash toàn cục...');
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log('✅ Các lệnh slash đã được đăng ký toàn cục! (có thể mất tới 1 giờ để hiển thị)');
    }
  } catch (error) {
    console.error('❌ Lỗi đăng ký lệnh:', error);
  }
}

client.once('clientReady', async () => {
  console.log(`🤖 Soki Tierlist đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);
  console.log(`   Code by ZirVN`);
  global.client = client;
  await registerCommands();
});

client.on('guildMemberAdd', async (member) => {
  try {
    await handleGuildMemberAdd(member);
  } catch (error) {
    console.error('❌ Lỗi xử lý guildMemberAdd (DM chào mừng):', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'verify-panel') {
        await sendVerifyPanel(interaction);
      } else if (interaction.commandName === 'queue-open') {
        const mode = interaction.options.getString('mode');
        await openQueue(interaction, mode);
      } else if (interaction.commandName === 'results') {
        const tier = interaction.options.getString('tier');
        const mode = interaction.options.getString('mode');
        await handleResults(interaction, tier, mode);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'verify_btn') {
        const modal = createVerifyModal();
        await interaction.showModal(modal);
        return;
      }
      if (interaction.customId === 'queue_btn') {
        await handleQueueButton(interaction);
        return;
      }
      if (interaction.customId === 'cooldown_btn') {
        await handleCooldownButton(interaction);
        return;
      }
      if (interaction.customId.startsWith('queue_')) {
        await handleTesterQueueButton(interaction);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_modal') {
        await handleVerifyModal(interaction);
        return;
      }
      if (interaction.customId === 'queue_modal') {
        await handleQueueModal(interaction);
        return;
      }
    }

  } catch (error) {
    console.error('❌ Lỗi xử lý tương tác:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Đã xảy ra lỗi khi xử lý tương tác.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.login(TOKEN);