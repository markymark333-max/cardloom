import type { ScrydexPrices } from './scrydex'

// Shared grader/grade tables — used by both the card detail and browse-add
// dialogs (previously duplicated verbatim in each).
export type Grader = 'RAW' | 'PSA' | 'CGC' | 'BGS' | 'TAG' | 'ACE' | 'SGC'

export const GRADER_GRADES: Record<Grader, string[]> = {
  RAW: ['NM', 'LP', 'MP', 'HP', 'DM'],
  PSA: ['10', '9', '8.5', '8', '7', '6', '5', '4', '3', '2', '1'],
  CGC: ['10', '9.5', '9', '8.5', '8', '7', '6.5', '6', '5.5', '5', '4.5', '4', '3', '2', '1.5', '1'],
  BGS: ['10', '9.5', '9', '8.5', '8'],
  TAG: ['10', '9', '8.5', '5.5', '1'],
  ACE: ['10'],
  SGC: ['10', '9.5', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
}

export const RAW_KEYS: Record<string, keyof ScrydexPrices['raw']> = {
  NM: 'nm',
  LP: 'lp',
  MP: 'mp',
  HP: 'hp',
  DM: 'dm',
}
