import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountSettings from './AccountSettings';
import { useGetStartupConfig, useGetUserBalance } from 'librechat-data-provider/react-query';
import { useAuthContext } from '~/hooks/AuthContext';

// Mock the hooks
jest.mock('librechat-data-provider/react-query', () => ({
  useGetStartupConfig: jest.fn(),
  useGetUserBalance: jest.fn(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

// Mock other dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key) => key,
}));

describe('AccountSettings', () => {
  const queryClient = new QueryClient();

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock the startup config
    (useGetStartupConfig as jest.Mock).mockReturnValue({
      data: { checkBalance: true },
    });

    // Mock the auth context
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { email: 'test@example.com', name: 'Test User' },
      isAuthenticated: true,
      logout: jest.fn(),
    });
  });

  it('displays balance when available in correct format xx,xx $', () => {
    // Mock the balance
    (useGetUserBalance as jest.Mock).mockReturnValue({
      data: '42420000', // This represents 1.23 in the displayed format
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <AccountSettings />
        </RecoilRoot>
      </QueryClientProvider>,
    );

    const balanceElement = screen.getByText(/Balance:/);
    expect(balanceElement).toHaveTextContent('Balance: 42,42 $');
  });
});
