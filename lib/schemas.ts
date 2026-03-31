import { z } from "zod";

export const BidSchema = z.object({
  room_id: z.string().uuid(),
  team_id: z.string().uuid(),
  bid_amount: z.number().int().positive(),
});

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(60),
  sport_id: z.string().min(1),
  purse: z.number().int().positive().optional(),
  timer_seconds: z.number().int().positive().optional(),
  max_teams: z.number().int().positive().optional(),
  bid_increments: z.array(z.number().int().positive()).optional(),
});

export type BidInput = z.infer<typeof BidSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

