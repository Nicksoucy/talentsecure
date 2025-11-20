import React, { useEffect } from 'react';
import { IconButton, Badge, Tooltip } from '@mui/material';
import { ShoppingCart as ShoppingCartIcon } from '@mui/icons-material';
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

  // Calculate total items in cart
  const itemCount = wishlist?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const handleClick = () => {
    openDrawer();
  };

  return (
    <Tooltip title="Panier">
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
              fontSize: '0.7rem',
            },
          }}
        >
          <ShoppingCartIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};

export default CartBadge;
