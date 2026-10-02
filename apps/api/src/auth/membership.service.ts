import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';

import { ROLES, type Role } from '@repo/contracts';
import { member } from '@repo/db';

import type { Database } from '../database/database.js';

@Injectable()
export class MembershipService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * The caller's role in the organization, or null when they aren't a member. Read on every
   * request, so removing a member or changing a role takes effect immediately.
   *
   * Better Auth can store several comma-separated roles; roles nest, so the highest one wins.
   * Unknown roles grant nothing.
   */
  async findRole(userId: string, organizationId: string): Promise<Role | null> {
    const [row] = await this.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
      .limit(1);
    if (!row) return null;
    const assigned = new Set(row.role.split(',').map((role) => role.trim()));
    return ROLES.find((role) => assigned.has(role)) ?? null;
  }
}
