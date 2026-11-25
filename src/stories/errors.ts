import type { Key } from '../lib/i18n'

/** Map technical errors to a localized, user-safe message key (raw database text is never shown to users). */
const ROOM_ERRORS: [string, Key][] = [
  ['room_locked', 'err_room_locked'], ['team_full', 'err_team_full'], ['already_in_team', 'err_already_in_team'], ['image_taken', 'err_image_taken'],
  ['captain_only', 'err_captain_only'], ['team_limit', 'err_team_limit'], ['name_taken', 'err_name_taken'], ['teams_disabled', 'err_teams_disabled'],
  ['not_in_room', 'err_not_in_room'], ['select_image_first', 'err_select_image_first'], ['teams_not_ready', 'err_teams_not_ready'],
  ['teams_without_image', 'err_teams_without_image'], ['not_enough_teams', 'err_not_enough_teams'], ['empty_team', 'err_empty_team'],
  ['story_not_published', 'err_story_not_published'], ['story_needs_two_images', 'err_story_needs_two_images'], ['invalid_team_count', 'err_invalid_team_count'],
  ['pin_required', 'err_pin_required'], ['invalid_pin', 'err_invalid_pin'], ['story_in_use', 'err_story_in_use'], ['invalid_name', 'err_invalid_name'],
  ['forbidden', 'err_forbidden'], ['card_open', 'err_card_open'], ['invalid_card_state', 'err_invalid_card_state'], ['room_not_playing', 'err_room_not_playing'],
  ['team_inactive', 'err_team_inactive'], ['rescue_disabled', 'err_rescue_disabled'], ['rescue_exhausted', 'err_rescue_exhausted'], ['deck_not_empty', 'err_deck_not_empty'],
  ['rescue_pool_empty', 'err_rescue_pool_empty'], ['reason_required', 'err_reason_required'], ['invalid_delta', 'err_invalid_delta'], ['invalid_answer', 'err_invalid_answer'],
  ['invalid_settings', 'err_invalid_settings']
]

export function errorKey(e: unknown): Key {
  const m = e instanceof Error ? e.message : ''
  for (const [code, key] of ROOM_ERRORS) if (m.includes(code)) return key
  if (m.includes('unsupported_type')) return 'errUnsupported'
  if (m.includes('file_too_large')) return 'errTooLarge'
  if (['image_download_failed', 'invalid_image_response', 'image_size_mismatch', 'image_decode_failed', 'image_sign_failed', 'invalid_image_reference', 'invalid_storage_path'].some((code) => m.includes(code))) return 'errImageUnavailable'
  if (m.includes('story_published')) return 'errPublished'
  if (m.includes('invalid_question')) return 'errInvalidQuestion'
  if (m.includes('piece_taken')) return 'errPieceTaken'
  if (m.includes('validation_failed')) return 'errValidation'
  return 'errGeneric'
}
export const isMappingsConflict = (e: unknown): boolean => e instanceof Error && e.message.includes('mappings_exist')
