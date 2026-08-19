import { create } from 'zustand';
import { generateWorld, type Club, type World } from '@/world/generate';

const DEFAULT_SEED = 'boot-room-01';

interface WorldState {
  world: World;
  /** The club the player manages, and the one lined up against them. */
  userClubId: string;
  opponentClubId: string;
  regenerate: (seed: string) => void;
  setUserClub: (id: string) => void;
  setOpponent: (id: string) => void;
  userClub: () => Club;
  opponentClub: () => Club;
}

function firstTwo(world: World): [string, string] {
  const top = world.leagues[0]?.clubIds ?? world.clubOrder;
  return [top[0] ?? world.clubOrder[0]!, top[1] ?? world.clubOrder[1]!];
}

const initial = generateWorld(DEFAULT_SEED);
const [firstClub, secondClub] = firstTwo(initial);

export const useWorld = create<WorldState>((set, get) => ({
  world: initial,
  userClubId: firstClub,
  opponentClubId: secondClub,

  regenerate: (seed) => {
    const world = generateWorld(seed);
    const [a, b] = firstTwo(world);
    set({ world, userClubId: a, opponentClubId: b });
  },

  setUserClub: (id) =>
    set((state) => ({
      userClubId: id,
      // Never let a club line up against itself.
      opponentClubId:
        state.opponentClubId === id
          ? (state.world.clubOrder.find((c) => c !== id) ?? state.opponentClubId)
          : state.opponentClubId,
    })),

  setOpponent: (id) =>
    set((state) => (id === state.userClubId ? state : { opponentClubId: id })),

  userClub: () => get().world.clubs[get().userClubId]!,
  opponentClub: () => get().world.clubs[get().opponentClubId]!,
}));
