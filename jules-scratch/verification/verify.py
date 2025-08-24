import re
from playwright.sync_api import sync_playwright, Page, expect

def verify_deduction(page: Page):
    """
    This script verifies that the core deduction logic is working and visible in the UI.
    """
    # 1. Navigate to the app
    page.goto("http://localhost:5173/")

    # 2. Add the rule (implication)
    new_thought_input = page.locator("#new-thought-input")
    add_button = page.locator("#add-new-thought-button")

    new_thought_input.fill("(implies (is_cat $x) (is_mammal $x))")
    add_button.click()

    # 3. Add the fact
    new_thought_input.fill("(is_cat tom)")
    add_button.click()

    # 4. Wait for and verify the conclusion
    completed_thoughts_list = page.locator("#completed-thoughts-list")

    # Expect the conclusion to appear. This is the key test.
    # Using a regular expression to be robust against extra whitespace or minor formatting changes.
    conclusion_locator = completed_thoughts_list.locator(".thought-card", has_text=re.compile(r"\s*\(is_mammal tom\)\s*"))

    expect(conclusion_locator).to_be_visible(timeout=10000) # Wait up to 10 seconds

    # 5. Take a screenshot for visual confirmation
    page.screenshot(path="jules-scratch/verification/verification.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        verify_deduction(page)
        browser.close()

if __name__ == "__main__":
    main()
