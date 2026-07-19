export class UploadAvatarCommand {
  constructor(
    public readonly userId: string,
    /** The UUID name multer already wrote the new avatar under. */
    public readonly storedName: string,
  ) {}
}
