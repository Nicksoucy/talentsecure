import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './database';
import { comparePassword } from '../utils/password';

// Local Strategy (Email/Password)
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) {
          return done(null, false, { message: 'Email ou mot de passe incorrect' });
        }

        if (!user.password) {
          return done(null, false, {
            message: 'Veuillez vous connecter avec Google ou Microsoft'
          });
        }

        if (!user.isActive) {
          return done(null, false, { message: 'Compte désactivé' });
        }

        const isMatch = await comparePassword(password, user.password);

        if (!isMatch) {
          return done(null, false, { message: 'Email ou mot de passe incorrect' });
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// JWT Strategy
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    },
    async (payload, done) => {
      try {
        // Check if this is a client token
        if (payload.role === 'CLIENT') {
          const client = await prisma.client.findUnique({
            where: { id: payload.userId },
          });

          if (!client) {
            return done(null, false);
          }

          // Return client as user with CLIENT role
          return done(null, {
            id: client.id,
            email: client.email,
            role: 'CLIENT',
            firstName: client.name,
            lastName: client.companyName || '',
          } as any);
        }

        // Otherwise, it's a regular user
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });

        if (!user) {
          return done(null, false);
        }

        if (!user.isActive) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error('Email non fourni par Google'), false);
          }

          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

          if (!user) {
            // Check if user exists with same email
            user = await prisma.user.findUnique({
              where: { email: email.toLowerCase() },
            });

            if (user) {
              // Link Google account to existing user
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  googleId: profile.id,
                  lastLoginAt: new Date(),
                },
              });
            } else {
              // Create new user
              user = await prisma.user.create({
                data: {
                  email: email.toLowerCase(),
                  googleId: profile.id,
                  firstName: profile.name?.givenName || 'Utilisateur',
                  lastName: profile.name?.familyName || 'Google',
                  role: 'SALES', // Default role for OAuth users
                  lastLoginAt: new Date(),
                },
              });
            }
          } else {
            // Update last login
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error, false);
        }
      }
    )
  );
}

// Microsoft OAuth Strategy would be similar
// (Passport-microsoft strategy implementation)

export default passport;
