import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramApiService {
  async sendMessage(
    token: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: chatId,
        text,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Telegram API failed: ${error.message}`
          : 'Telegram API failed',
      );
    }
  }
}
