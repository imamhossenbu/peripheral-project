import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsAuthPayload, WsJwtAuthGuard } from '../auth/guard/ws-jwt-auth.guard';
import { OrderTrackingService } from './tracking.service';
import { PushLocationDto } from './dto/tracking.dto';


type AuthedSocket = Socket & { data: { user?: WsAuthPayload } };

function roomFor(orderId: string) {
  return `order:${orderId}`;
}

@WebSocketGateway({
  namespace: 'order-tracking',
  cors: { origin: '*' }, // production e নিজের frontend origin দিয়ে replace korio
})
export class OrderTrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private trackingService: OrderTrackingService) {}

  handleConnection(client: AuthedSocket) {
    // Connection accept hoy, kintu kono room e join hoy na jotokhon na
    // client subscribe event pathay (auth + ownership check tokhon hobe)
  }

  handleDisconnect(client: AuthedSocket) {
    // Socket.io nijei room theke remove kore disconnect hole, ekhane extra kichu lagena
  }

  // ── Student/Admin: ekta order er live update e subscribe korbe ──────
  @UseGuards(WsJwtAuthGuard
  )
  @SubscribeMessage('subscribeToOrder')
  async handleSubscribe(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const user = client.data.user;
    if (!user) {
      throw new WsException('Unauthorized');
    }

    if (user.role === 'STUDENT') {
      const owns = await this.trackingService.verifyOwnership(
        data.orderId,
        user.userId,
      );
      if (!owns) {
        throw new WsException('You can only track your own orders');
      }
    }

    client.join(roomFor(data.orderId));

    // Subscribe korar shathe shathe current location (jodi thake) pathiye dao
    const current = await this.trackingService.getCurrentLocation(data.orderId);
    return { event: 'subscribed', orderId: data.orderId, current };
  }

  @SubscribeMessage('unsubscribeFromOrder')
  handleUnsubscribe(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    client.leave(roomFor(data.orderId));
    return { event: 'unsubscribed', orderId: data.orderId };
  }

  // ── Staff/Admin: location push korbe (phone theke periodic call) ────
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('pushLocation')
  async handlePushLocation(
    @MessageBody() data: PushLocationDto,
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const user = client.data.user;
    if (!user) {
      throw new WsException('Unauthorized');
    }
    if (user.role === 'STUDENT') {
      throw new WsException('Only staff or admin can push location updates');
    }

    const tracking = await this.trackingService.recordLocation({
      orderId: data.orderId,
      staffId: user.userId,
      latitude: data.latitude,
      longitude: data.longitude,
      stage: data.stage,
      note: data.note,
    });

    // Room e shobaike (student + onno admin) broadcast koro
    this.server.to(roomFor(data.orderId)).emit('locationUpdate', {
      orderId: data.orderId,
      latitude: tracking.latitude,
      longitude: tracking.longitude,
      stage: tracking.stage,
      note: tracking.note,
      recordedAt: tracking.recordedAt,
    });

    return { event: 'locationPushed', trackingId: tracking.id };
  }
}
