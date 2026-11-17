/**
 * The one-page doctor brief rules now live in src/lib/onePageBrief.ts, shared with the device (Download PDF).
 * Re-exported here so server code and tests keep their imports.
 */
export { CASE_PAGE, ONE_PAGE, buildOnePageBrief, fitToOnePage, type BriefParse } from '../../src/lib/onePageBrief.js';
