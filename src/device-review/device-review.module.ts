import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DeviceReviewController } from "./device-review.controller";
import { DeviceReviewService } from "./device-review.service";

@Module({
    imports: [PrismaModule, NotificationModule],
    controllers: [DeviceReviewController],
    providers: [DeviceReviewService],
    exports: [DeviceReviewService],
})

export class DeviceReviewModule {}