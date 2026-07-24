import { describe, expect, it } from "vitest";
import { buildMiniAppDeepLink } from "../src/lib/miniapp-link";

describe("buildMiniAppDeepLink", () => {
  it("строит t.me deep-link со startapp=slug", () => {
    expect(buildMiniAppDeepLink("Sekretar_Syrov_IP_bot", "wms-ii-scheta-za-15-minut")).toBe(
      "https://t.me/Sekretar_Syrov_IP_bot?startapp=wms-ii-scheta-za-15-minut",
    );
  });

  it("обрезает ведущий @ у username", () => {
    expect(buildMiniAppDeepLink("@bot", "a-b")).toBe("https://t.me/bot?startapp=a-b");
  });
});
