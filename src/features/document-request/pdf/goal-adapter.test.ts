import { describe, expect, it } from "vitest";
import { adaptGoalFillPayload, buildRequestDocumentDataInput, GoalAdapterError } from "./goal-adapter";

const baseGoal = {
  title: "City Contract Register",
  public_summary: "Track every contract the city has signed with surveillance vendors.",
  government_entity_id: 4,
  fill_payload: {
    request: {
      records_description: "All executed contracts, amendments, and pricing schedules with Flock Safety.",
      department_or_division: "City Clerk",
      record_category_label: "Contracts",
      date_from_mm_dd_yyyy: "01/01/2024",
      date_to_mm_dd_yyyy: "12/31/2025",
      delivery_method: "electronic",
    },
  },
};

describe("adaptGoalFillPayload", () => {
  it("uses public_summary as request.goal_language and fill_payload.records_description verbatim as records_description", () => {
    const request = adaptGoalFillPayload(baseGoal);
    expect(request.goal_language).toBe(baseGoal.public_summary);
    expect(request.records_description).toBe(baseGoal.fill_payload.request.records_description);
    expect(request.goal_language).not.toBe(request.records_description);
  });

  it("never substitutes public_summary for records_description even when summary text overlaps", () => {
    const goal = {
      ...baseGoal,
      public_summary: "Broad transparency purpose text.",
      fill_payload: { request: { ...baseGoal.fill_payload.request, records_description: "Narrow approved request language." } },
    };
    const request = adaptGoalFillPayload(goal);
    expect(request.records_description).toBe("Narrow approved request language.");
    expect(request.records_description).not.toContain("Broad transparency purpose text.");
  });

  it("normalizes stored MM/DD/YYYY dates to ISO", () => {
    const request = adaptGoalFillPayload(baseGoal);
    expect(request.date_from).toBe("2024-01-01");
    expect(request.date_to).toBe("2025-12-31");
  });

  it("omits department, category, and dates when the payload does not provide them", () => {
    const goal = {
      ...baseGoal,
      fill_payload: { request: { records_description: "Contracts.", delivery_method: "inspection" } },
    };
    const request = adaptGoalFillPayload(goal);
    expect(request).not.toHaveProperty("department_or_division");
    expect(request).not.toHaveProperty("record_category_label");
    expect(request).not.toHaveProperty("date_from");
    expect(request).not.toHaveProperty("date_to");
  });

  it("throws MISSING_GOAL_PURPOSE when public_summary is missing", () => {
    const goal = { ...baseGoal, public_summary: "" };
    expect(() => adaptGoalFillPayload(goal)).toThrow(GoalAdapterError);
    try {
      adaptGoalFillPayload(goal);
    } catch (error) {
      expect((error as GoalAdapterError).code).toBe("MISSING_GOAL_PURPOSE");
    }
  });

  it("throws MISSING_RECORDS_DESCRIPTION when the payload has no records_description", () => {
    const goal = { ...baseGoal, fill_payload: { request: { delivery_method: "electronic" } } };
    try {
      adaptGoalFillPayload(goal);
      throw new Error("Expected throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(GoalAdapterError);
      expect((error as GoalAdapterError).code).toBe("MISSING_RECORDS_DESCRIPTION");
    }
  });

  it("throws MISSING_DELIVERY_METHOD when the approved payload has no delivery method (the common current case)", () => {
    const goal = {
      ...baseGoal,
      fill_payload: { request: { records_description: "Contracts." } },
    };
    try {
      adaptGoalFillPayload(goal);
      throw new Error("Expected throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(GoalAdapterError);
      expect((error as GoalAdapterError).code).toBe("MISSING_DELIVERY_METHOD");
    }
  });

  it("throws UNRECOGNIZED_DELIVERY_METHOD for a stored value outside the allowlist instead of guessing", () => {
    const goal = {
      ...baseGoal,
      fill_payload: { request: { records_description: "Contracts.", delivery_method: "paper" } },
    };
    try {
      adaptGoalFillPayload(goal);
      throw new Error("Expected throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(GoalAdapterError);
      expect((error as GoalAdapterError).code).toBe("UNRECOGNIZED_DELIVERY_METHOD");
    }
  });

  it.each(["electronic", "inspection", "onsite_pickup", "usps_mail"])(
    "accepts the allowlisted delivery method %s",
    (deliveryMethod) => {
      const goal = { ...baseGoal, fill_payload: { request: { records_description: "Contracts.", delivery_method: deliveryMethod } } };
      expect(adaptGoalFillPayload(goal).delivery_method).toBe(deliveryMethod);
    },
  );

  it("throws INVALID_DATE for a malformed stored date instead of loosely parsing it", () => {
    const goal = {
      ...baseGoal,
      fill_payload: { request: { ...baseGoal.fill_payload.request, date_from_mm_dd_yyyy: "2024-01-01" } },
    };
    try {
      adaptGoalFillPayload(goal);
      throw new Error("Expected throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(GoalAdapterError);
      expect((error as GoalAdapterError).code).toBe("INVALID_DATE");
    }
  });
});

describe("buildRequestDocumentDataInput", () => {
  it("assembles government_entity, request, and profile from adapted inputs", () => {
    const profile = { id: "profile-id", version: 2, government_entity_id: "4" };
    const entity = { id: "4", legal_name: "City of Murfreesboro", display_name: "City of Murfreesboro" };
    const input = buildRequestDocumentDataInput(baseGoal, profile, entity);
    expect(input.government_entity).toBe(entity);
    expect(input.profile).toEqual({ id: "profile-id", version: 2, government_entity_id: "4" });
    expect((input.request as Record<string, unknown>).records_description).toBe(
      baseGoal.fill_payload.request.records_description,
    );
  });
});
