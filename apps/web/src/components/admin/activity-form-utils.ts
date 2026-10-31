export function formatPublicationState(state: string) {
  return state ? state[0].toUpperCase() + state.slice(1) : "";
}
