export interface RoomAvailability {
  roomId: string;
  startAt: Date;
  endAt: Date;
}

export interface RoomPort {
  checkAvailability(startAt: Date, endAt: Date): Promise<string[]>;
  confirm(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void>;
  relocate(
    bookingId: string,
    newRoomId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void>;
  cancel(bookingId: string): Promise<void>;
}
