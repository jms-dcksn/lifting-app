export function sessionPath(id: string) {
  return `/session/${id}`;
}

export function sessionRecapPath(id: string) {
  return `${sessionPath(id)}/recap`;
}
