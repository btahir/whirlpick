// All keyword landing pages, in the PLAN §8 table order.
import type { LandingContent } from "../types";

import randomNamePicker from "./random-name-picker.js";
import yesOrNoWheel from "./yes-or-no-wheel.js";
import randomTeamGenerator from "./random-team-generator.js";
import randomGroupGenerator from "./random-group-generator.js";
import randomNumberWheel from "./random-number-wheel.js";
import letterWheel from "./letter-wheel.js";
import whatShouldIEatWheel from "./what-should-i-eat-wheel.js";
import truthOrDareWheel from "./truth-or-dare-wheel.js";
import raffleWinnerPicker from "./raffle-winner-picker.js";
import classroomNamePicker from "./classroom-name-picker.js";
import classroomWheelNoAds from "./classroom-wheel-no-ads.js";
import decisionWheel from "./decision-wheel.js";
import choreWheel from "./chore-wheel.js";
import countryWheel from "./country-wheel.js";
import listRandomizer from "./list-randomizer.js";
import isTheWheelRigged from "./is-the-wheel-rigged.js";

export const LANDING_PAGES: LandingContent[] = [
  randomNamePicker,
  yesOrNoWheel,
  randomTeamGenerator,
  randomGroupGenerator,
  randomNumberWheel,
  letterWheel,
  whatShouldIEatWheel,
  truthOrDareWheel,
  raffleWinnerPicker,
  classroomNamePicker,
  classroomWheelNoAds,
  decisionWheel,
  choreWheel,
  countryWheel,
  listRandomizer,
  isTheWheelRigged,
];

const BY_SLUG: ReadonlyMap<string, LandingContent> = new Map(LANDING_PAGES.map((p) => [p.slug, p]));

/** The landing page for a slug (without slashes), or undefined if there is none. */
export function landingBySlug(slug: string): LandingContent | undefined {
  return BY_SLUG.get(slug);
}
