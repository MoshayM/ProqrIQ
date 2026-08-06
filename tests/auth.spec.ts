import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toHaveText('ProqrIQ');
    await expect(page.locator('h2')).toContainText('Welcome back');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
  });

  test('shows demo credentials on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Demo credentials')).toBeVisible();
    await expect(page.locator('text=admin@autoquote.com').first()).toBeVisible();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'notanemail');
    await page.fill('#password', 'somepassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=valid email')).toBeVisible();
  });

  test('shows validation error for empty password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@autoquote.com');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('shows error message for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@autoquote.com');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    // Server returns "Invalid email or password"
    await expect(page.locator('.bg-red-50')).toContainText('Invalid', { timeout: 10000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@autoquote.com');
    await page.fill('#password', 'AutoQuote2024!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();
  });

  test('unauthenticated access to /dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to /quotes redirects to login', async ({ page }) => {
    await page.goto('/quotes');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('root / redirects authenticated user to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@autoquote.com');
    await page.fill('#password', 'AutoQuote2024!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
