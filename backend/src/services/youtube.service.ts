import axios from 'axios';
import { config } from '../config';

export async function subscribeToChannel(
  channelId: string
) {
  const callback =
    `${config.publicUrl}/admin-api/youtube/webhook`;

  const topic =
    `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

  const params = new URLSearchParams();

  params.append('hub.mode', 'subscribe');
  params.append('hub.topic', topic);
  params.append('hub.callback', callback);
  params.append('hub.verify', 'async');

  await axios.post(
    'https://pubsubhubbub.appspot.com/subscribe',
    params,
    {
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
    }
  );

  console.log(
    `[YouTube] Suscripción enviada: ${channelId}`
  );
}