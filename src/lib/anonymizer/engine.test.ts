import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { analyzeText } from "@/lib/anonymizer/engine";

describe("analyzer engine", () => {
  it("detects universal email and card", () => {
    const text = "Email: john.doe@example.com Card: 4111 1111 1111 1111";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const types = result.entities.map((e) => e.type);
    assert.equal(types.includes("EMAIL"), true);
    assert.equal(types.includes("CARD"), true);
    assert.equal(result.anonymizedText.includes("[EMAIL_1]"), true);
  });

  it("detects regional doc id when region enabled", () => {
    const text = "Паспорт: 45 11 123456";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU"],
    });

    assert.equal(result.entities.some((e) => e.region === "RU" && e.type === "DOC_ID"), true);
  });

  it("keeps deterministic mapping for same source values", () => {
    const text = "Email a@b.com then again a@b.com";
    const result = analyzeText({
      text,
      replaceMode: "synthetic",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const emails = result.entities.filter((e) => e.type === "EMAIL");
    assert.equal(emails.length, 2);
    assert.equal(emails[0].replacement, emails[1].replacement);
  });

  it("anonymizes full person name in client context", () => {
    const text = "Клиент: Иванов Иван Иванович";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const person = result.entities.find((e) => e.type === "PERSON");
    assert.equal(Boolean(person), true);
    assert.equal(result.anonymizedText.includes("[PERSON_1]"), true);
  });

  it("detects mixed-region fixture entities", () => {
    const fixturePath = path.join(process.cwd(), "src/lib/anonymizer/__fixtures__/mixed-region-sample.txt");
    const text = fs.readFileSync(fixturePath, "utf-8");

    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const hasRuDoc = result.entities.some((e) => e.region === "RU" && e.type === "DOC_ID");
    const hasAmDoc = result.entities.some((e) => e.region === "AM" && e.type === "DOC_ID");
    const hasEuDoc = result.entities.some((e) => e.region === "EU" && e.type === "DOC_ID");

    assert.equal(hasRuDoc, true);
    assert.equal(hasAmDoc, true);
    assert.equal(hasEuDoc, true);
    assert.equal(result.mappings.length > 0, true);
  });

  it("detects generic dates and does not classify them as PHONE in period sentence", () => {
    const text = "I am requesting a visa for the period from 10.06.2026 to 09.06.2027.";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const dateEntities = result.entities.filter((e) => e.type === "DATE");
    const phoneEntities = result.entities.filter((e) => e.type === "PHONE");

    assert.equal(dateEntities.length, 2);
    assert.equal(phoneEntities.length, 0);
    assert.equal(result.anonymizedText.includes("[DATE_1]"), true);
    assert.equal(result.anonymizedText.includes("[DATE_2]"), true);
  });

  it("detects dates in born/check-in/check-out examples", () => {
    const text = "born 27.12.2013\nCheck-in: 10.06.2026; Check-out: 01.07.2026;";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const dateEntities = result.entities.filter((e) => e.type === "DATE");
    const phoneEntities = result.entities.filter((e) => e.type === "PHONE");

    assert.equal(dateEntities.length, 3);
    assert.equal(phoneEntities.length, 0);
    assert.equal(result.anonymizedText.includes("[DATE_1]"), true);
    assert.equal(result.anonymizedText.includes("[DATE_2]"), true);
    assert.equal(result.anonymizedText.includes("[DATE_3]"), true);
  });
});
