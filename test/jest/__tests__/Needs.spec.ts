/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @jest-environment jsdom
 */
import { Wrapper } from "@vue/test-utils";
import App from "../../../src/App.vue";
import { mountComponent } from "../utils";
import { QInnerLoading, QInfiniteScroll } from "quasar";
import NeedCard from "../../../src/components/NeedCard.vue";
import PageHeader from "../../../src/layouts/PageHeader.vue";
import { seeds } from "src/server";

// See also Offers.spec.ts
describe("Needs", () => {
  let wrapper: Wrapper<Vue>;

  beforeAll(async () => {
    seeds();
    wrapper = await mountComponent(App, { login: true });
  });
  afterAll(() => wrapper.destroy());

  it("Loads needs and searches", async () => {
    // Wait for login redirect
    await wrapper.vm.$wait();
    expect(wrapper.vm.$route.path).toBe("/groups/GRP0/needs");
    expect(wrapper.findComponent(QInnerLoading).isVisible()).toBe(true);
    expect(wrapper.findComponent(QInfiniteScroll).props("disable")).toBe(true);
    // Load.
    await wrapper.vm.$wait();
    expect(wrapper.findAllComponents(NeedCard).length).toBe(4);
    // Infinite loading stops working immediately since we
    // already fetched all data.
    expect(wrapper.findComponent(QInfiniteScroll).props("disable")).toBe(true);
    // Category
    expect(wrapper.findAllComponents(NeedCard).at(1).text()).toContain("build");

    wrapper.getComponent(PageHeader).vm.$emit("search","modi");
    await wrapper.vm.$wait();
    // found 4 results!
    expect(wrapper.findAllComponents(NeedCard).length).toBe(2);
  });
  it ("Renders single need", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/needs/Et-quae-po");
    await wrapper.vm.$wait();
    const text = wrapper.text();
    expect(text).toContain("Esteban");
    expect(text).toContain("Baby");
    expect(text).toContain("Et quae");
    expect(text).toContain("GRP00009");
    expect(text).toContain("Updated yesterday");
    expect(text).toContain("Expires");
    expect(text).toContain("Share");
    expect(text).toContain("Contact");
  });
});