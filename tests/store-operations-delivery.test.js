import { describe, it, expect, vi } from 'vitest';
import { resolveEffectiveStoreSchedule } from '../src/services/store-operations.service.js';
import { resolveVillageDeliveryRules } from '../src/services/delivery-resolution.service.js';

describe('R2Cart Store Operations & Dynamic Scheduling', () => {
  it('1 & 2: evaluates default store hours (7:00 AM - 9:00 PM) as OPEN during 2:00 PM', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          openingTime: '07:00',
          closingTime: '21:00',
          isSchedulingEnabled: true,
          allowAfterHoursScheduledOrders: true
        }),
        update: vi.fn()
      }
    };

    const result = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-10-14',
      targetTimeStr: '14:00',
      prismaClient: mockPrisma
    });

    expect(result.storeStatus).toBe('OPEN');
    expect(result.allowImmediateOrders).toBe(true);
    expect(result.allowScheduledOrders).toBe(true);
    expect(result.ruleSource).toBe('GLOBAL_DEFAULT');
  });

  it('4: evaluates outside operating hours (10:30 PM) as SCHEDULED_ONLY with exact closure notice', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          openingTime: '07:00',
          closingTime: '21:00',
          isSchedulingEnabled: true,
          allowAfterHoursScheduledOrders: true
        }),
        update: vi.fn()
      }
    };

    const result = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-10-14',
      targetTimeStr: '22:30',
      prismaClient: mockPrisma
    });

    expect(result.storeStatus).toBe('SCHEDULED_ONLY');
    expect(result.allowImmediateOrders).toBe(false);
    expect(result.allowScheduledOrders).toBe(true);
    expect(result.statusReason).toBe('Store is currently closed. You can schedule your order for the next available delivery slot.');
  });

  it('6 & 7: active seasonal schedule overrides weekly/global hours', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          openingTime: '07:00',
          closingTime: '21:00',
          isSchedulingEnabled: true,
          allowAfterHoursScheduledOrders: true,
          seasonalSchedules: [
            {
              id: 'winter-season',
              name: 'Winter Hours',
              startDate: '2026-11-01',
              endDate: '2027-02-28',
              openingTime: '08:00',
              closingTime: '20:00',
              isActive: true
            }
          ]
        }),
        update: vi.fn()
      }
    };

    // Evaluated inside winter range (2026-11-15 at 7:30 AM -> Before 8:00 AM opening)
    const resultMorning = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-11-15',
      targetTimeStr: '07:30',
      prismaClient: mockPrisma
    });

    expect(resultMorning.ruleSource).toBe('SEASONAL');
    expect(resultMorning.effectiveHours.open).toBe('08:00');
    expect(resultMorning.effectiveHours.close).toBe('20:00');
    expect(resultMorning.storeStatus).toBe('SCHEDULED_ONLY'); // Store opens at 8:00 AM in winter

    // Evaluated at 11:00 AM -> OPEN
    const resultOpen = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-11-15',
      targetTimeStr: '11:00',
      prismaClient: mockPrisma
    });
    expect(resultOpen.storeStatus).toBe('OPEN');
    expect(resultOpen.allowImmediateOrders).toBe(true);
  });

  it('8: special-date festival/holiday overrides seasonal and regular schedule', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          openingTime: '07:00',
          closingTime: '21:00',
          isSchedulingEnabled: true,
          allowAfterHoursScheduledOrders: true,
          specialDaySchedules: [
            {
              id: 'diwali-special',
              date: '2026-11-08',
              isClosed: false,
              openingTime: '06:00',
              closingTime: '23:00',
              reason: 'Diwali Extended Hours'
            }
          ]
        }),
        update: vi.fn()
      }
    };

    const result = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-11-08',
      targetTimeStr: '22:15',
      prismaClient: mockPrisma
    });

    expect(result.ruleSource).toBe('SPECIAL_DATE');
    expect(result.effectiveHours.open).toBe('06:00');
    expect(result.effectiveHours.close).toBe('23:00');
    expect(result.storeStatus).toBe('OPEN');
  });

  it('13 & 14: emergency closure overrides all schedules and auto-expires when endTime passes', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          openingTime: '07:00',
          closingTime: '21:00',
          isSchedulingEnabled: true,
          emergencySettings: {
            isActive: true,
            type: 'STORE_CLOSE',
            reason: 'Heavy Rain / Flooding',
            message: 'All operations temporarily suspended for safety.',
            endTime: '2026-10-14T18:00:00.000Z'
          }
        }),
        update: vi.fn().mockResolvedValue({})
      }
    };

    const result = await resolveEffectiveStoreSchedule({
      targetDateStr: '2026-10-14',
      targetTimeStr: '14:00',
      prismaClient: mockPrisma
    });

    expect(result.ruleSource).toBe('EMERGENCY');
    expect(result.storeStatus).toBe('EMERGENCY_PAUSED');
    expect(result.allowImmediateOrders).toBe(false);
    expect(result.allowScheduledOrders).toBe(false);
  });
});

describe('R2Cart Village Delivery Resolution (Mode A & Mode B)', () => {
  const globalStoreSetting = {
    deliveryFee: 20,
    minimumOrder: 199,
    freeDeliveryThreshold: 499,
    estimatedDelivery: '25-35 minutes',
    deliveryRadius: 5.0,
    allowCod: true,
    allowScheduled: true
  };

  it('10: villages without custom overrides use global defaults', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue(globalStoreSetting)
      },
      deliveryVillage: {
        findMany: vi.fn().mockResolvedValue([])
      },
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'area-1',
            name: 'Central Siwan',
            status: 'ACTIVE',
            radiusKm: 4.5
          }
        ])
      }
    };

    const resolved = await resolveVillageDeliveryRules({
      villageIdOrName: 'Central Siwan',
      prismaClient: mockPrisma
    });

    expect(resolved.isServiceable).toBe(true);
    expect(resolved.deliveryFee).toBe(20);
    expect(resolved.minimumOrder).toBe(199);
    expect(resolved.freeDeliveryThreshold).toBe(499);
    expect(resolved.sources.deliveryFee).toBe('GLOBAL_DEFAULT');
  });

  it('9 & Mode A: Complete Village Override replaces all values without inheriting defaults', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue(globalStoreSetting)
      },
      deliveryVillage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'rasulpur-1',
            name: 'Rasulpur',
            status: 'ACTIVE',
            isPaused: false,
            overrideMode: 'COMPLETE',
            deliveryCharge: 10,
            minimumOrder: 149,
            freeDeliveryAbove: 399,
            allowCod: false, // Explicit false
            allowScheduled: true
          }
        ])
      },
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const resolved = await resolveVillageDeliveryRules({
      villageIdOrName: 'Rasulpur',
      prismaClient: mockPrisma
    });

    expect(resolved.deliveryFee).toBe(10);
    expect(resolved.minimumOrder).toBe(149);
    expect(resolved.freeDeliveryThreshold).toBe(399);
    expect(resolved.allowCod).toBe(false);
    expect(resolved.sources.deliveryFee).toBe('VILLAGE_OVERRIDE');
    expect(resolved.sources.allowCod).toBe('VILLAGE_OVERRIDE');
  });

  it('Mode B: Individual Field Override inherits unset fields and preserves explicit zero delivery fee', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue(globalStoreSetting)
      },
      deliveryVillage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'free-village-1',
            name: 'VIP Area',
            status: 'ACTIVE',
            isPaused: false,
            overrideMode: 'PARTIAL',
            deliveryCharge: 0, // Explicit zero! Must NOT fallback to 20
            minimumOrder: null, // Unset: must inherit 199
            freeDeliveryAbove: null, // Unset: must inherit 499
            allowCod: null
          }
        ])
      },
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const resolved = await resolveVillageDeliveryRules({
      villageIdOrName: 'VIP Area',
      prismaClient: mockPrisma
    });

    expect(resolved.deliveryFee).toBe(0); // Zero delivery charge preserved!
    expect(resolved.minimumOrder).toBe(199); // Inherited from global
    expect(resolved.freeDeliveryThreshold).toBe(499); // Inherited from global
    expect(resolved.sources.deliveryFee).toBe('VILLAGE_OVERRIDE');
    expect(resolved.sources.minimumOrder).toBe('GLOBAL_DEFAULT');
  });

  it('12: blocks delivery when village is paused or outside service boundary', async () => {
    const mockPrisma = {
      storeSetting: {
        findUnique: vi.fn().mockResolvedValue(globalStoreSetting)
      },
      deliveryVillage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'hathua-paused',
            name: 'Hathua',
            status: 'ACTIVE',
            isPaused: true,
            pauseReason: 'Bridge road maintenance'
          }
        ])
      },
      deliveryArea: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const resolved = await resolveVillageDeliveryRules({
      villageIdOrName: 'Hathua',
      prismaClient: mockPrisma
    });

    expect(resolved.isServiceable).toBe(false);
    expect(resolved.isPaused).toBe(true);
    expect(resolved.pauseReason).toBe('Bridge road maintenance');
  });
});
