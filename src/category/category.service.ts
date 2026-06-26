import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from './dto/category.dto';

type FlatCategory = {
  id: string;
  name: string;
  parentId: string | null;
  [key: string]: any;
};

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: CategoryQueryDto) {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    if (query.tree) {
      return this.buildTree(categories);
    }

    return categories;
  }

  // root থেকে শুরু করে সব descendants কে nested subCategories আকারে সাজায়
  private buildTree(flatCategories: FlatCategory[]) {
    const map = new Map<string, any>();
    const roots: any[] = [];

    for (const cat of flatCategories) {
      map.set(cat.id, { ...cat, subCategories: [] });
    }

    for (const cat of flatCategories) {
      const mapped = map.get(cat.id);
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId).subCategories.push(mapped);
      } else {
        roots.push(mapped);
      }
    }

    return roots;
  }

  // নির্দিষ্ট একটা category কে root ধরে তার নিচের পুরো subtree (সব level) বানায়,
  // প্রতিটা node এ devices সহ
  private buildSubtree(
    rootId: string,
    flatCategories: FlatCategory[],
    devicesByCategoryId: Map<string, any[]>,
  ) {
    const childrenByParent = new Map<string, FlatCategory[]>();
    for (const cat of flatCategories) {
      if (!cat.parentId) continue;
      const list = childrenByParent.get(cat.parentId) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parentId, list);
    }

    const build = (catId: string): any => {
      const cat = flatCategories.find((c) => c.id === catId);
      if (!cat) return null;

      const children = childrenByParent.get(catId) ?? [];

      return {
        ...cat,
        devices: devicesByCategoryId.get(catId) ?? [],
        subCategories: children.map((child) => build(child.id)),
      };
    };

    return build(rootId);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    // পুরো tree (flat) + সব devices আনো, তারপর এই id কে root ধরে subtree বানাও
    const [allCategories, allDevices] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.device.findMany({
        select: {
          id: true,
          name: true,
          brand: true,
          model: true,
          status: true,
          categoryId: true,
        },
      }),
    ]);

    const devicesByCategoryId = new Map<string, any[]>();
    for (const device of allDevices) {
      const list = devicesByCategoryId.get(device.categoryId) ?? [];
      list.push(device);
      devicesByCategoryId.set(device.categoryId, list);
    }

    const subtree = this.buildSubtree(id, allCategories, devicesByCategoryId);

    return {
      ...subtree,
      parent: category.parent,
    };
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with ID ${dto.parentId} not found`,
        );
      }
    }

    return this.prisma.category.create({
      data: dto,
    });
  }

  // dto.parentId কে নতুন parent ধরে তার ancestor chain ধরে উপরে উঠে দেখে কোথাও
  // movingCategoryId পড়ে কিনা — পড়লে সেটা একটা cycle তৈরি করবে
  private async assertNoCycle(movingCategoryId: string, newParentId: string) {
    let currentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === movingCategoryId) {
        throw new BadRequestException(
          'Cannot move a category under its own descendant (would create a cycle)',
        );
      }
      if (visited.has(currentId)) {
        // ইতিমধ্যেই data তে একটা cycle আছে — safety break, infinite loop ঠেকাও
        break;
      }
      visited.add(currentId);

      const current: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });
      currentId = current?.parentId ?? null;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    // Check if category exists
    await this.prisma.category.findUnique({ where: { id } }).then((cat) => {
      if (!cat) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
    });

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with ID ${dto.parentId} not found`,
        );
      }

      // পুরো ancestor chain ধরে cycle check করো
      await this.assertNoCycle(id, dto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    // Check if it has subcategories
    const subCategoriesCount = await this.prisma.category.count({
      where: { parentId: id },
    });
    if (subCategoriesCount > 0) {
      throw new BadRequestException(
        'Cannot delete category because it has subcategories. Delete or re-assign them first.',
      );
    }

    // Check if it has devices
    const devicesCount = await this.prisma.device.count({
      where: { categoryId: id },
    });
    if (devicesCount > 0) {
      throw new BadRequestException(
        'Cannot delete category because it contains active devices. Delete or move the devices first.',
      );
    }

    const deleted = await this.prisma.category.delete({
      where: { id },
    });

    return {
      message: 'Category deleted successfully',
      id: deleted.id,
    };
  }
}
