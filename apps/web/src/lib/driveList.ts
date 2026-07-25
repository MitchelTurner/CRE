const KEY = 'cre:drive-list';

export interface DriveListItem {
  pin: string;
  situsAddress: string | null;
  ownerName: string | null;
  score: number | null;
  whyNow: string | null;
  phone: string | null;
}

export function saveDriveList(items: DriveListItem[]) {
  localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), items }));
}

export function loadDriveList(): DriveListItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: DriveListItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function downloadDriveListCsv(items: DriveListItem[], filename = 'drive-list.csv') {
  const header = ['pin', 'address', 'owner', 'score', 'phone', 'why_now'];
  const lines = [
    header.join(','),
    ...items.map((i) =>
      [
        i.pin,
        csv(i.situsAddress),
        csv(i.ownerName),
        i.score ?? '',
        csv(i.phone),
        csv(i.whyNow),
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(value: string | null | undefined): string {
  const v = value ?? '';
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
