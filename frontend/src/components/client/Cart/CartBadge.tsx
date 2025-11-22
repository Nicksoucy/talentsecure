import React, { useEffect } from 'react';
import { IconButton, Badge, Tooltip, Box, Typography, Chip } from '@mui/material';
import { ShoppingCart as ShoppingCartIcon, AttachMoney as MoneyIcon } from '@mui/icons-material';
import { useWishlistStore } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';

const CartBadge: React.FC = () => {
  const { wishlist, fetchWishlist, openDrawer } = useWishlistStore();
  const { accessToken } = useClientAuthStore();

  // Fetch wishlist on mount
  useEffect(() => {
    if (accessToken) {
      fetchWishlist(accessToken).catch((error) => {
        console.error('Error fetching wishlist:', error);
      });
    }
  }, [accessToken, fetchWishlist]);

  // Calculate total items and total cost
  const itemCount = wishlist?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalCost = Number(wishlist?.totalAmount || 0);

  const handleClick = () => {
    openDrawer();
  };

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="body2" fontWeight="bold">Mon Panier</Typography>
          {itemCount > 0 && (
            <>
              <Typography variant="caption" display="block">
                {itemCount} article{itemCount > 1 ? 's' : ''}
              </Typography>
              <Typography variant="caption" display="block" sx={{ color: 'success.light' }}>
                Total: {totalCost.toFixed(2)}$
              </Typography>
            </>
          )}
        </Box>
      }
      arrow
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <IconButton
          color="inherit"
          onClick={handleClick}
          sx={{
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          <Badge
            badgeContent={itemCount}
            color="error"
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                fontWeight: 'bold',
                fontSize: '0.75rem',
                minWidth: '22px',
                height: '22px',
              },
            }}
          >
            <ShoppingCartIcon />
          </Badge>
        </IconButton>

        {/* Running total chip - visible when items in cart */}
        {itemCount > 0 && (
          <Chip
            icon={<MoneyIcon sx={{ fontSize: '0.9rem !important' }} />}
            label={`${totalCost.toFixed(2)}$`}
            size="small"
            color="success"
            sx={{
              position: 'absolute',
              bottom: -8,
              right: -8,
              height: 20,
              fontSize: '0.7rem',
              fontWeight: 'bold',
              '& .MuiChip-icon': {
                marginLeft: '4px',
              },
              '& .MuiChip-label': {
                paddingLeft: '4px',
                paddingRight: '6px',
              },
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
};

export default CartBadge;
