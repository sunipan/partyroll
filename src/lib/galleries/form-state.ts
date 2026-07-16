export type CreateGalleryFormState = {
  errors?: {
    name?: string[];
    eventDate?: string[];
  };
  message?: string;
  values: {
    name: string;
    eventDate: string;
  };
};

export const initialCreateGalleryFormState: CreateGalleryFormState = {
  values: { name: "", eventDate: "" },
};
