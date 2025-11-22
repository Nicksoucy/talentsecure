import React from 'react';
import { Snackbar, Alert, Slide, SlideProps, Box } from '@mui/material';
import { CheckCircle as CheckCircleIcon, ShoppingCart as CartIcon } from '@mui/icons-material';
import { animations } from '@/utils/animations';

interface AddToCartSuccessProps {
    open: boolean;
    onClose: () => void;
    message: string;
}

function SlideTransition(props: SlideProps) {
    return <Slide {...props} direction="up" />;
}

const AddToCartSuccess: React.FC<AddToCartSuccessProps> = ({ open, onClose, message }) => {
    return (
        <Snackbar
            open={open}
            autoHideDuration={3000}
            onClose={onClose}
            TransitionComponent={SlideTransition}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert
                onClose={onClose}
                severity="success"
                variant="filled"
                icon={<CheckCircleIcon />}
                sx={{
                    animation: animations.scaleIn,
                    boxShadow: '0 8px 16px rgba(76, 175, 80, 0.3)',
                    '& .MuiAlert-icon': {
                        animation: animations.pulse,
                    },
                }}
            >
                <Box display="flex" alignItems="center" gap={1}>
                    <CartIcon />
                    {message}
                </Box>
            </Alert>
        </Snackbar>
    );
};

export default AddToCartSuccess;
