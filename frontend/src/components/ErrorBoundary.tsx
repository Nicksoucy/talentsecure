import { Component, ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // eslint-disable-next-line no-console
    console.error('Erreur UI capturee', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" textAlign="center" gap={2}>
          <Typography variant="h5" color="text.primary">
            Une erreur inattendue est survenue.
          </Typography>
          {this.state.errorMessage && (
            <Typography variant="body2" color="text.secondary">
              {this.state.errorMessage}
            </Typography>
          )}
          <Button variant="contained" onClick={this.handleReload}>
            Recharger la page
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
