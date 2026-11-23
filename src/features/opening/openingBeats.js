export const OPENING_ZOOM_DELAY = 0.04;
const launchDuration = 0.18;
const airborneDuration = 1.24 * 0.86;
const coastDuration = 0.65;
const flightDuration = airborneDuration + coastDuration;
export const OPENING_LANDING_AT = airborneDuration / flightDuration;
export const OPENING_BEATS = {
  reveal: 0.5,
  launch: launchDuration,
  flight: flightDuration,
  zoom: launchDuration + flightDuration * OPENING_LANDING_AT - OPENING_ZOOM_DELAY,
};
