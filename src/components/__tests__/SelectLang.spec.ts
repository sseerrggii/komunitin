
import SelectLang from "../SelectLang.vue";
import { Wrapper } from "@vue/test-utils"
import { mountComponent } from "../../../test/jest/utils";

/**
 * This test uses the global Vue variable in order to properly interact 
 * with boot functions and i18n plugin. It does not just tet the component 
 * but also the language logic.
 * **/
describe("SelectLang", () => {
  let wrapper: Wrapper<Vue>;
  beforeAll(async () => {
    wrapper = await mountComponent(SelectLang);
  });
  afterAll(() => wrapper.destroy());

  it("Check language change", async () => {
    expect(wrapper.text()).toContain("Language");
    // Check language on i18n plugin.
    expect(wrapper.vm.$i18n.locale).toBe("en-us");
    // Check language on quasar.
    expect(wrapper.vm.$q.lang.isoName).toBe("en-us");
    // Don't know how to simulate the click on the menu item,
    // so invocking the method directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.vm as any).changeLanguage("ca");
    // Check language changed on i18n plugin.
    expect(wrapper.vm.$i18n.locale).toBe("ca");
    // Check language changed on quasar.
    expect(wrapper.vm.$q.lang.isoName).toBe("ca");
    expect(wrapper.emitted('language-change')).toBeTruthy();
  });
});
