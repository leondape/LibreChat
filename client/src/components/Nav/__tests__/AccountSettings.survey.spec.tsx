import React from 'react';
import { render, screen } from '@testing-library/react';
import AccountSettings from '../AccountSettings';

const surveyState = { available: false };

jest.mock('recoil', () => ({
  useSetRecoilState: () => jest.fn(),
}));

jest.mock('@ariakit/react/menu', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const MenuButton = ReactActual.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
    (props, ref) => <button ref={ref} {...props} />,
  );
  return {
    MenuProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuButton,
    Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuItem: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  };
});

jest.mock('@librechat/client', () => ({
  GearIcon: () => <span />,
  DropdownMenuSeparator: () => <hr />,
  Avatar: () => <span data-testid="avatar" />,
}));

jest.mock('~/components/Nav/SettingsTabs/General/ArchivedChatsModal', () => () => null);
jest.mock('../Settings', () => () => null);
jest.mock('~/store', () => ({
  __esModule: true,
  default: { showShortcutsDialog: {} },
}));
jest.mock('~/utils', () => ({
  formatCost: () => '',
  openInNewTab: jest.fn(),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({
    user: { name: 'Ada', id: 'user-1' },
    isAuthenticated: true,
    logout: jest.fn(),
  }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: {} }),
  useGetUserBalance: () => ({ data: null }),
}));
jest.mock('~/components/Survey', () => ({
  useSurvey: () => ({ available: surveyState.available, open: jest.fn() }),
}));

describe('AccountSettings survey badge', () => {
  beforeEach(() => {
    surveyState.available = false;
  });

  it('leaves the account button unmarked when no survey is waiting', () => {
    render(<AccountSettings />);

    expect(screen.getByTestId('nav-user')).toHaveAttribute(
      'aria-label',
      'com_nav_account_settings',
    );
    expect(screen.queryByTestId('survey-waiting')).not.toBeInTheDocument();
    expect(screen.queryByText('com_survey_menu')).not.toBeInTheDocument();
  });

  it('marks the avatar and the menu entry while a survey is available', () => {
    surveyState.available = true;
    render(<AccountSettings />);

    expect(screen.getByTestId('nav-user')).toHaveAttribute(
      'aria-label',
      'com_nav_account_settings, com_survey_badge',
    );
    expect(screen.getByTestId('survey-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('survey-waiting-menu')).toBeInTheDocument();
  });
});
