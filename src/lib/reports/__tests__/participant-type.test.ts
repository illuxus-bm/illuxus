import { describe, expect, it } from "vitest";
import { emailSet, participantType, PARTICIPANT_TYPE_ORDER } from "../participant-type";

const speakers = emailSet(["Ajay@SparkMinda.com", null, ""]);
const sponsors = emailSet([" rep@keka.com "]);

describe("participantType", () => {
  it("goes by ticket type first", () => {
    expect(participantType("speaker", "someone@x.com", speakers, sponsors)).toBe("speaker");
    expect(participantType("sponsor", "someone@x.com", speakers, sponsors)).toBe("sponsor");
  });

  it("then by email, ignoring case and spaces", () => {
    expect(participantType("general", " ajay@sparkminda.com", speakers, sponsors)).toBe("speaker");
    expect(participantType("vip", "REP@keka.com", speakers, sponsors)).toBe("sponsor");
  });

  it("a speaker email wins over a sponsor email", () => {
    expect(participantType("general", "both@x.com", emailSet(["both@x.com"]), emailSet(["both@x.com"]))).toBe("speaker");
  });

  it("everyone else is a delegate", () => {
    expect(participantType("general", "delegate@x.com", speakers, sponsors)).toBe("delegate");
    expect(participantType(null, null, speakers, sponsors)).toBe("delegate");
  });

  it("orders speakers, sponsors, delegates", () => {
    const sorted = (["delegate", "sponsor", "speaker"] as const).slice().sort((a, b) => PARTICIPANT_TYPE_ORDER[a] - PARTICIPANT_TYPE_ORDER[b]);
    expect(sorted).toEqual(["speaker", "sponsor", "delegate"]);
  });
});
