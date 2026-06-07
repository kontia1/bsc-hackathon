
import asyncio, json, os, sys
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        profile_dir = "/root/projects/browser-profiles/kontiasuu"
        
        # Launch persistent Camoufox context
        browser = await p.firefox.launch_persistent_context(
            profile_dir,
            headless=True,
            viewport={"width": 1280, "height": 800},
        )
        
        page = browser.pages[0] if browser.pages else await browser.new_page()
        
        # Navigate to DoraHacks login
        await page.goto("https://dorahacks.io/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3000)
        print(f"PAGE: {page.url}", flush=True)

        # Click Continue with Google
        google_btn = page.locator('button:has-text("Continue with Google")')
        if await google_btn.count() > 0:
            await google_btn.click()
            print("CLICKED_GOOGLE", flush=True)
        else:
            print("NO_GOOGLE_BTN", flush=True)
            await browser.close()
            return

        await page.wait_for_timeout(5000)
        print(f"GOOGLE_URL: {page.url}", flush=True)

        # Check if we see account picker or email input
        content = await page.content()
        
        # If email input visible, type kontiasuu@gmail.com
        email_input = page.locator('input[type="email"]')
        if await email_input.count() > 0:
            await email_input.fill("kontiasuu@gmail.com")
            next_btn = page.locator('button:has-text("Next"), button:has-text("Berikutnya")')
            if await next_btn.count() > 0:
                await next_btn.click()
                print("EMAIL_ENTERED", flush=True)
                await page.wait_for_timeout(5000)
                print(f"AFTER_EMAIL: {page.url}", flush=True)
        
        # If "Use another account" link visible
        other = page.locator('a:has-text("Gunakan akun lain"), a:has-text("Use another account")')
        if await other.count() > 0:
            await other.click()
            print("USE_ANOTHER", flush=True)
            await page.wait_for_timeout(3000)
            
            # Type email
            email_input2 = page.locator('input[type="email"]')
            if await email_input2.count() > 0:
                await email_input2.fill("kontiasuu@gmail.com")
                next_btn = page.locator('button:has-text("Next"), button:has-text("Berikutnya")')
                if await next_btn.count() > 0:
                    await next_btn.click()
                    print("EMAIL_ENTERED_2", flush=True)
                    await page.wait_for_timeout(5000)
                    print(f"AFTER_EMAIL_2: {page.url}", flush=True)

        # Check current state
        print(f"FINAL_URL: {page.url}", flush=True)
        
        # Check if password needed
        pwd_input = page.locator('input[type="password"]')
        if await pwd_input.count() > 0:
            print("NEED_PASSWORD", flush=True)
        else:
            print("NO_PASSWORD_NEEDED", flush=True)
        
        # Get page title/text for debug
        title = await page.title()
        print(f"TITLE: {title}", flush=True)
        
        # Save state
        state = await browser.storage_state()
        state_path = os.path.expanduser("~/.agent/credentials/dorahacks-storage-state.json")
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
        print(f"STATE_SAVED: {state_path}", flush=True)
        
        await browser.close()

asyncio.run(main())
