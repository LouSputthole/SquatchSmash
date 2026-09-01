/**
 * Pure data adapter for the campaign radio production workbook.
 *
 * The workbook is presentation. `src/core/radio-program.js` is authority.
 * Keeping this adapter dependency-free lets the ordinary Node suite prove the
 * spreadsheet rows before artifact_tool ever formats or exports an XLSX.
 */
import {
  CAMPAIGN_RADIO_BEATS,
  PHYSICAL_RADIO_RECEIVERS,
  RADIO_PROGRAMS,
} from '../src/core/radio-program.js';

export const LIVE_RADIO_WORKBOOK_COLUMNS = Object.freeze([
  'Record type', 'Beat ID', 'Policy', 'Receiver ID', 'Campaign news',
  'Program ID', 'Target seconds', 'Show hour', 'Order', 'Block ID',
  'Block type', 'Content ID', 'Resume key', 'Evidence',
]);

const contentId = (entry) => entry.songId ?? entry.adId ?? entry.newsId
  ?? entry.noticeId ?? entry.linkId ?? entry.id ?? '';

export function buildLiveRadioWorkbookRows() {
  const rows = [];
  for (const [beatId, declaration] of Object.entries(CAMPAIGN_RADIO_BEATS)) {
    rows.push({
      'Record type': 'BEAT',
      'Beat ID': beatId,
      Policy: declaration.policy,
      'Receiver ID': declaration.receiverId ?? '',
      'Campaign news': declaration.receiverId
        ? (PHYSICAL_RADIO_RECEIVERS[declaration.receiverId]?.campaignNews ?? 'UNDECLARED')
        : 'N/A',
      'Program ID': declaration.programId ?? '',
      'Target seconds': '',
      'Show hour': '',
      Order: '',
      'Block ID': '',
      'Block type': '',
      'Content ID': '',
      'Resume key': declaration.programId
        ? `campaign.radio.programProgress.${declaration.programId}` : 'N/A',
      Evidence: 'src/core/radio-program.js · CAMPAIGN_RADIO_BEATS',
    });
  }

  for (const program of RADIO_PROGRAMS) {
    const campaignNews = PHYSICAL_RADIO_RECEIVERS[program.receiverId]?.campaignNews ?? 'UNDECLARED';
    rows.push({
      'Record type': 'PROGRAM',
      'Beat ID': program.beatId,
      Policy: program.policy,
      'Receiver ID': program.receiverId,
      'Campaign news': campaignNews,
      'Program ID': program.id,
      'Target seconds': program.targetSeconds,
      'Show hour': program.showHour,
      Order: '',
      'Block ID': '',
      'Block type': '',
      'Content ID': '',
      'Resume key': `campaign.radio.programProgress.${program.id}`,
      Evidence: 'src/core/radio-program.js · RADIO_PROGRAMS',
    });
    program.blocks.forEach((entry, index) => rows.push({
      'Record type': 'BLOCK',
      'Beat ID': program.beatId,
      Policy: program.policy,
      'Receiver ID': program.receiverId,
      'Campaign news': campaignNews,
      'Program ID': program.id,
      'Target seconds': program.targetSeconds,
      'Show hour': program.showHour,
      Order: index + 1,
      'Block ID': entry.id,
      'Block type': entry.type,
      'Content ID': contentId(entry),
      'Resume key': `campaign.radio.programProgress.${program.id}`,
      Evidence: 'tools/verify-radio-program.mjs · ordered playback receipt',
    }));
  }

  for (const [receiverId, receiver] of Object.entries(PHYSICAL_RADIO_RECEIVERS)) {
    rows.push({
      'Record type': 'RECEIVER',
      'Beat ID': '',
      Policy: '',
      'Receiver ID': receiverId,
      'Campaign news': receiver.campaignNews,
      'Program ID': '',
      'Target seconds': '',
      'Show hour': '',
      Order: '',
      'Block ID': '',
      'Block type': '',
      'Content ID': '',
      'Resume key': `campaign.radio.receivers.${receiverId}`,
      Evidence: 'src/core/radio-program.js · PHYSICAL_RADIO_RECEIVERS',
    });
  }
  return rows;
}

export function liveRadioWorkbookMatrix() {
  return buildLiveRadioWorkbookRows().map((row) => LIVE_RADIO_WORKBOOK_COLUMNS.map((column) => row[column] ?? ''));
}
