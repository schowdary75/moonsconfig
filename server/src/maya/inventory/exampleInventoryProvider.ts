import { z } from 'zod';
import {
  RESERVED_EXAMPLE_INVENTORY_PROVIDER,
  type HotelOffer,
  type HotelQuery,
  type InventoryResult,
  type LiveInventoryProvider,
} from './inventoryProvider.js';

const exampleResponseSchema = z.object({
  results: z.array(
    z.object({
      supplierReference: z.string().trim().min(1),
      propertyName: z.string().trim().min(1),
      roomName: z.string().trim().min(1),
      mealPlan: z.string().trim().min(1),
      amount: z.number().finite().nonnegative(),
      cancellationText: z.string().trim().min(1),
    }),
  ),
});

export type ExampleInventoryTransport = (request: {
  destination: string;
  arrivalDate: string;
  departureDate: string;
  occupancy: number;
}) => Promise<unknown>;

/**
 * Credential-free mapping example for contributors. It is deliberately absent
 * from the runtime registry and refuses production construction. Returned
 * supplier names are watermarked so fixtures cannot be mistaken for bookable
 * inventory.
 */
export function createExampleInventoryProvider(options: {
  transport: ExampleInventoryTransport;
  runtime?: string;
}): LiveInventoryProvider {
  if ((options.runtime ?? process.env.NODE_ENV) === 'production') {
    throw new Error('The example inventory provider cannot run in production');
  }

  return {
    configured: true,
    async searchHotels(query: HotelQuery): Promise<InventoryResult<HotelOffer>> {
      const response = await options.transport({
        destination: query.destination,
        arrivalDate: query.checkIn.toISOString().slice(0, 10),
        departureDate: query.checkOut.toISOString().slice(0, 10),
        occupancy: query.guests,
      });
      const parsed = exampleResponseSchema.safeParse(response);
      if (!parsed.success) {
        return {
          available: false,
          provider: RESERVED_EXAMPLE_INVENTORY_PROVIDER,
          offers: [],
        };
      }
      return {
        available: true,
        provider: RESERVED_EXAMPLE_INVENTORY_PROVIDER,
        offers: parsed.data.results.map((offer) => ({
          supplier: `EXAMPLE-NOT-BOOKABLE:${offer.supplierReference}`,
          hotelName: offer.propertyName,
          roomType: offer.roomName,
          boardBasis: offer.mealPlan,
          totalPriceInr: offer.amount,
          cancellationPolicy: offer.cancellationText,
        })),
      };
    },
  };
}
