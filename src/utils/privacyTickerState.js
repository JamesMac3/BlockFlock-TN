export const PRIVACY_TICKER_HIDE_AT = 72;
export const PRIVACY_TICKER_SHOW_AT = 20;

export function shouldCollapsePrivacyTicker(currentlyCollapsed, scrollY) {
  return currentlyCollapsed
    ? scrollY > PRIVACY_TICKER_SHOW_AT
    : scrollY > PRIVACY_TICKER_HIDE_AT;
}
