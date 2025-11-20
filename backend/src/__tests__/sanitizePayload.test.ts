import { sanitizePayload } from '../controllers/prospect.controller';

describe('sanitizePayload', () => {
  it('trims nested strings and converts empty strings to null', () => {
    const input = {
      firstName: '  Alice  ',
      lastName: '',
      email: 'TEST@MAIL.COM ',
      profile: {
        city: '  Montreal ',
        note: '',
      },
      experiences: [
        { company: 'XGuard', startDate: '', endDate: '2023-01-01' },
      ],
    };

    const result = sanitizePayload(input);

    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBeNull();
    expect(result.email).toBe('TEST@MAIL.COM');
    expect(result.profile.city).toBe('Montreal');
    expect(result.profile.note).toBeNull();
    expect(result.experiences[0].startDate).toBeNull();
    expect(result.experiences[0].endDate).toBe('2023-01-01');
  });

  it('handles arrays and nested empty values', () => {
    const input = {
      languages: [
        { language: 'French ', level: 'ADVANCED' },
        { language: '', level: undefined },
      ],
    };

    const result = sanitizePayload(input);

    expect(result.languages[0].language).toBe('French');
    expect(result.languages[1].language).toBeNull();
    expect(result.languages[1].level).toBeNull();
  });
});
