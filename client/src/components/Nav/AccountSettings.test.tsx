import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountSettings from './AccountSettings';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

// Mock hooks from the data-provider
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
  useGetUserBalance: jest.fn(),
}));

// Mock the auth context
jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

// Mock localization so that the key is returned as-is
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AccountSettings', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure the startup config enables balance checking.
    (useGetStartupConfig as jest.Mock).mockReturnValue({
      data: { balance: { enabled: true } },
      isLoading: false,
    });

    // Provide a valid balance with correct data structure.
    (useGetUserBalance as jest.Mock).mockReturnValue({
      data: {
        tokenCredits: 42420000,
        autoRefillEnabled: false,
      },
      isLoading: false,
    });

    // Set up an authenticated user.
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { email: 'test@example.com', name: 'Test User' },
      isAuthenticated: true,
      logout: jest.fn(),
    });
  });

  it('should display balance in correct format (e.g. "42,42 $") in the dropdown', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <AccountSettings />
        </RecoilRoot>
      </QueryClientProvider>,
    );

    // Open the dropdown (the popover controlled by Ariakit)
    const navUser = screen.getByTestId('nav-user');
    fireEvent.click(navUser);

    // The balance is rendered using Intl.NumberFormat('de-DE') which formats
    // the number (42420000 / 1_000_000 = 42.42) as "42,42" in German locale
    // The final format becomes: "com_nav_balance: 42,42 $"
    //
    // Since the localized label might change in future, we simply wait for the
    // formatted number string to appear.
    const balanceText = await screen.findByText(/42,42 \$/);
    expect(balanceText).toBeInTheDocument();
  });
});
