/**
 * Fixed internal manifest for the branded /documents/:documentSlug route.
 *
 * This is the only place a Supabase Storage bucket/object path may be
 * chosen for that route — the route itself never accepts a bucket or path
 * from a query parameter or any other caller-supplied input. Adding a
 * document means adding an entry here, not passing coordinates through the
 * URL.
 */
export const DOCUMENT_MANIFEST = {
  "murfreesboro-city-request-form": {
    title: "Murfreesboro City Public Records Request Form",
    category: "blank_request_template",
    governmentEntity: "City of Murfreesboro",
    county: "Rutherford County",
    bucket: "request-templates",
    objectPath:
      "entities/4/forms/1a9704a8bfa983aae2dc057091aaa5985901235a135bc5e374f5d9b0f98ca3d2.pdf",
    downloadFilename: "murfreesboro-city-public-records-request-form.pdf",
  },
  "murfreesboro-police-request-form": {
    title: "Murfreesboro Police Department Public Records Request Form",
    category: "blank_request_template",
    governmentEntity: "Murfreesboro Police Department",
    county: "Rutherford County",
    bucket: "request-templates",
    objectPath:
      "entities/5/forms/1ad9e2cfb6889e4d57909e75084184996278ed5aac0c8612e7d0997d6fae33ad.pdf",
    downloadFilename: "murfreesboro-police-public-records-request-form.pdf",
  },
  "6-points-about-surveillance": {
    title: "6 Points About Surveillance",
    category: "presentation",
    governmentEntity: null,
    bucket: "education-materials",
    objectPath: "6pointsaboutsurveillence.pdf",
    downloadFilename: "6-points-about-surveillance.pdf",
  },
};

const CATEGORY_LABELS = {
  blank_request_template: "Blank request template",
  presentation: "Presentation",
};

export function getDocumentEntry(slug) {
  return DOCUMENT_MANIFEST[slug] ?? null;
}

export function getDocumentCategoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category;
}

export function listDocumentsByCategory(category) {
  return Object.entries(DOCUMENT_MANIFEST)
    .filter(([, entry]) => entry.category === category)
    .map(([slug, entry]) => ({ slug, ...entry }));
}
