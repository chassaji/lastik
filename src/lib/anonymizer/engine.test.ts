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

  it("anonymizes full person name in strong field-label context", () => {
    const text = "ФИО: Иванов Иван Иванович";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const person = result.entities.find((e) => e.type === "PERSON");
    assert.equal(Boolean(person), true);
    assert.equal(result.anonymizedText.includes("[PERSON_1]"), true);
  });

  it("anonymizes latin full name with strict English hints", () => {
    const text = "First name: John Smith";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const person = result.entities.find((e) => e.type === "PERSON");
    assert.equal(Boolean(person), true);
  });

  it("anonymizes full person name when field label is on previous line", () => {
    const text = "Данные заявителя:\nИванов Иван Иванович";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const person = result.entities.find((e) => e.type === "PERSON");
    assert.equal(Boolean(person), true);
  });

  it("does not anonymize names in greeting/sign-off only context", () => {
    const text = "С уважением, Иванов Иван Иванович";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const person = result.entities.find((e) => e.type === "PERSON");
    assert.equal(Boolean(person), false);
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

  it("detects ipv4 and ipv6 addresses", () => {
    const text = "Client IPs: 192.168.1.1, 2001:0db8:85a3::8a2e:0370:7334, and ::1";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const ipEntities = result.entities.filter((e) => e.type === "IP");
    assert.equal(ipEntities.length, 3);
    assert.equal(result.anonymizedText.includes("[IP_1]"), true);
    assert.equal(result.anonymizedText.includes("[IP_2]"), true);
    assert.equal(result.anonymizedText.includes("[IP_3]"), true);
  });

  it("ignores invalid ipv4 ranges", () => {
    const text = "Not valid IPs: 999.168.1.1 and 256.0.0.1";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const ipEntities = result.entities.filter((e) => e.type === "IP");
    assert.equal(ipEntities.length, 0);
  });

  it("classifies 16-digit card-like values as CARD, not PHONE", () => {
    const text = "Card: 4532 7100 1234 5678";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const cardEntities = result.entities.filter((e) => e.type === "CARD");
    const phoneEntities = result.entities.filter((e) => e.type === "PHONE");

    assert.equal(cardEntities.length, 1);
    assert.equal(phoneEntities.length, 0);
    assert.equal(result.anonymizedText.includes("[CARD_1]"), true);
  });

  it("accepts card grouping with double spaces", () => {
    const text = "Card: 4111  1111  1111  1111";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const cardEntities = result.entities.filter((e) => e.type === "CARD");
    assert.equal(cardEntities.length, 1);
  });

  it("detects address when label and value are split across lines", () => {
    const text = "Anschrift:\nMusterstraße 12\n10115 Berlin";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const addressEntities = result.entities.filter((e) => e.type === "ADDRESS");
    assert.equal(addressEntities.length >= 1, true);
    assert.equal(result.anonymizedText.includes("[ADDRESS_1]"), true);
  });

  it("does not detect postcode+city as address without address context", () => {
    const text = "Order reference: 10115 Berlin shipment batch.";
    const result = analyzeText({
      text,
      replaceMode: "tag",
      enabledRegions: ["RU", "AM", "EU"],
    });

    const addressEntities = result.entities.filter((e) => e.type === "ADDRESS");
    assert.equal(addressEntities.length, 0);
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
