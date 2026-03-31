export interface SportConfig {
  id: string;
  sportType: string;
  displayName: string;
  currency: { symbol: string; unit: string; multiplier: number };
  purse: { default: number; min: number; max: number };
  timer: { default: number; min: number; max: number };
  roster: {
    maxTeams: number;
    maxPlayers: number;
    minPlayers: number;
    roles: string[];
    positionMins: Record<string, number>;
    specialRules: SpecialRule[];
  };
  scoring: ScoringRule[];
  tiers: string[];
  bidIncrements: number[];
}

export interface SpecialRule {
  type: "max_foreign" | "salary_cap" | "position_max";
  field: string;
  limit: number;
  label: string;
}

export interface ScoringRule {
  action: string;
  label: string;
  points: number;
  condition?: string;
}

/** Row shapes aligned with Supabase (snake_case) */
export type AuctionRoom = {
  id: string;
  sport_id: string;
  name: string;
  invite_code: string;
  host_id: string;
  status: "lobby" | "live" | "paused" | "completed";
  config: RoomRuntimeConfig;
  current_player_id: string | null;
  current_bid: number;
  current_bidder_team_id: string | null;
  player_queue: string[];
  queue_index: number;
  created_at: string;
};

export type RoomRuntimeConfig = {
  purse: number;
  timerSeconds: number;
  maxTeams: number;
  bidIncrements: number[];
};

export type AuctionTeam = {
  id: string;
  room_id: string;
  owner_id: string;
  team_name: string;
  team_color: string;
  remaining_purse: number;
  players_bought: number;
  overseas_count: number;
  is_ready: boolean;
  created_at: string;
  /** Fantasy: up to 11; empty = all squad eligible for match points until set. */
  starting_xi_player_ids?: string[] | null;
  captain_player_id?: string | null;
  vice_captain_player_id?: string | null;
};

/** Private sheet league team (Supabase `private_league_teams`). */
export type PrivateLeagueTeam = {
  id: string;
  league_id: string;
  owner_id: string;
  team_name: string;
  team_color: string;
  squad_player_ids: string[];
  starting_xi_player_ids: string[];
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
  created_at: string;
};

/** Minimal shape for leaderboard / charts (auction or private). */
export type LeagueTeamDisplay = {
  id: string;
  team_name: string;
  team_color?: string | null;
};

export type BidRow = {
  id: string;
  room_id: string;
  player_id: string;
  team_id: string;
  amount: number;
  created_at: string;
};

export type PlayerRow = {
  id: string;
  sport_id: string;
  name: string;
  nationality: string | null;
  is_overseas: boolean;
  role: string;
  base_price: number;
  stats: Record<string, unknown>;
  image_url: string | null;
  tier: string | null;
  created_at: string;
};
