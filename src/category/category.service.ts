import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto/category.dto';

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

  private buildTree(flatCategories: any[]) {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // Initialize map with empty subCategories lists
    for (const cat of flatCategories) {
      map.set(cat.id, { ...cat, subCategories: [] });
    }

    // Connect children to parents or push to roots
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

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        subCategories: true,
        devices: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category with ID ${dto.parentId} not found`);
      }
    }

    return this.prisma.category.create({
      data: dto,
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    // Check if category exists
    await this.findOne(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category with ID ${dto.parentId} not found`);
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    // Check if category exists
    await this.findOne(id);

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
