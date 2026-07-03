export function programIndexHref() {
  return "/program";
}

export function programNewHref() {
  return "/program/new";
}

export function programDetailHref(id: string) {
  return `/program/${encodeURIComponent(id)}`;
}

export function programEditHref(id: string) {
  return `${programDetailHref(id)}?mode=edit`;
}
