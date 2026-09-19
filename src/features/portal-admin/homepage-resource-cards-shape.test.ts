import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// eslint-disable-next-line import/no-unresolved -- Vite/Vitest ?raw import
import homePageSource from "../../pages/Home/HomePage.jsx?raw";

// Vitest's default CSS handling empties plain .css imports (even with
// ?raw), so this reads the file directly rather than importing it.
const homePageCss = readFileSync(new URL("../../pages/Home/HomePage.css", import.meta.url), "utf8");

const valuedOrgCard = homePageSource.match(/\{\s*\n\s*title: "Valued Organizations",[\s\S]*?\n {2}\},/)?.[0] ?? "";
const tnSitesCard = homePageSource.match(/\{\s*title: "Tennessee Sites",[\s\S]*?\r?\n {2}\},?\r?\n\];/)?.[0] ?? "";

describe("Homepage related-resources: MuckRock and Atlas of Surveillance removed, Panopticon Index added", () => {
  it("no longer lists MuckRock or Atlas of Surveillance as cards", () => {
    expect(homePageSource).not.toMatch(/MuckRock/);
    expect(homePageSource).not.toMatch(/Atlas of Surveillance/);
    expect(homePageSource).not.toMatch(/atlasofsurveillance\.org/);
    expect(homePageSource).not.toMatch(/muckrock\.com/);
  });

  it("the DeFlock card is titled \"Valued Organizations\" and links to Panopticon Index with the exact required description", () => {
    expect(valuedOrgCard).toBeTruthy();
    expect(homePageSource).not.toMatch(/title: "DeFlock"/);
    expect(valuedOrgCard).toMatch(/url: "https:\/\/panopticonindex\.com\/"/);
    expect(valuedOrgCard).toMatch(/description: "Investigate the people and companies building America's surveillance\."/);
    expect(valuedOrgCard).toMatch(/url: "https:\/\/maps\.deflock\.org\/"/);
  });

  it("both DeFlock and Panopticon Index links use bundled logo images from src/assets", () => {
    expect(homePageSource).toMatch(/import deflockLogo from "\.\.\/\.\.\/assets\/deflock\.png";/);
    expect(homePageSource).toMatch(/import panopticonLogo from "\.\.\/\.\.\/assets\/panopticon\.png";/);
    expect(valuedOrgCard).toMatch(/logo: deflockLogo/);
    expect(valuedOrgCard).toMatch(/logo: panopticonLogo/);
  });

  it("a link with a logo renders the image itself as the clickable button, not a text button", () => {
    expect(homePageSource).toMatch(/if \(!link\.logo\) \{/);
    expect(homePageSource).toMatch(/<img\s*\n\s*src=\{link\.logo\}\s*\n\s*alt=\{link\.label\}/);
  });
});

describe("Homepage related-resources: Tennessee Sites also uses logo buttons, Nashville's square mark set apart", () => {
  it("all three Tennessee Sites links now carry a bundled logo image", () => {
    expect(homePageSource).toMatch(/import crossvilleLogo from "\.\.\/\.\.\/assets\/crossville\.png";/);
    expect(homePageSource).toMatch(/import maryvilleLogo from "\.\.\/\.\.\/assets\/maryville\.png";/);
    expect(homePageSource).toMatch(/import nashvilleLogo from "\.\.\/\.\.\/assets\/Nashville\.png";/);
    expect(tnSitesCard).toMatch(/logo: crossvilleLogo/);
    expect(tnSitesCard).toMatch(/logo: maryvilleLogo/);
    expect(tnSitesCard).toMatch(/logo: nashvilleLogo/);
  });

  it("only Nashville is flagged square — its roughly-square mark gets the less-compressed, left-of-the-stack treatment", () => {
    expect(tnSitesCard).toMatch(/label: "Nashville Community Safety", url: "https:\/\/nashvillecommunitysafety\.net\/", logo: nashvilleLogo, square: true/);
    expect(tnSitesCard).not.toMatch(/logo: crossvilleLogo, square: true/);
    expect(tnSitesCard).not.toMatch(/logo: maryvilleLogo, square: true/);
  });

  it("a card with a square-flagged link renders the row+stack layout (square logo left, the rest stacked beside it), not the plain column", () => {
    expect(homePageSource).toMatch(/const squareLinks = resource\.links\.filter\(\(link\) => link\.square\);/);
    expect(homePageSource).toMatch(/const stackedLinks = resource\.links\.filter\(\(link\) => !link\.square\);/);
    expect(homePageSource).toMatch(/squareLinks\.length > 0 \?/);
    expect(homePageSource).toMatch(/<div className="resource-card__logo-row">/);
    expect(homePageSource).toMatch(/<div className="resource-card__logo-stack">/);
  });

  it("the square variant compresses the logo less than the standard button height", () => {
    const squareBlock = homePageCss.match(/\.resource-card__logo-button--square \{[\s\S]*?\}/)?.[0] ?? "";
    expect(squareBlock).toMatch(/height: 4\.5rem;/);
    const standardBlock = homePageCss.match(/^\.resource-card__logo-button \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(standardBlock).toMatch(/height: 2\.9rem;/);
  });

  it("the row wrapper is still pushed to the bottom of the card like the plain link column is", () => {
    const rowBlock = homePageCss.match(/\.resource-card__logo-row \{[\s\S]*?\}/)?.[0] ?? "";
    expect(rowBlock).toMatch(/margin-top: auto;/);
  });
});

describe("Homepage related-resources: tighter spacing between title, description, and buttons", () => {
  it("the heading and description bottom margins were reduced from their original 0.75rem/1.5rem", () => {
    const headingBlock = homePageCss.match(/\.resource-card h3 \{[\s\S]*?\}/)?.[0] ?? "";
    const paragraphBlock = homePageCss.match(/\.resource-card p \{[\s\S]*?\}/)?.[0] ?? "";
    expect(headingBlock).toMatch(/margin: 0 0 0\.4rem;/);
    expect(paragraphBlock).toMatch(/margin: 0 0 0\.85rem;/);
  });
});

describe("Homepage related-resources: logo buttons sized and rounded to match the site's standard button", () => {
  it("the logo button image is sized to the site's standard 2.9rem button height", () => {
    expect(homePageCss).toMatch(/\.resource-card__logo-button \{\s*\n\s*height: 2\.9rem;/);
    expect(homePageCss).toMatch(/\.button \{\s*\n\s*min-height: 2\.9rem;/);
  });

  it("the logo button's corners are rounded to match the site's standard 0.55rem button radius", () => {
    const logoButtonBlock = homePageCss.match(/^\.resource-card__logo-button \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(logoButtonBlock).toMatch(/border-radius: 0\.55rem;/);
    expect(logoButtonBlock).toMatch(/overflow: hidden;/);
    const buttonBlock = homePageCss.match(/^\.button \{[\s\S]*?\}/m)?.[0] ?? "";
    expect(buttonBlock).toMatch(/border-radius: 0\.55rem;/);
  });
});
