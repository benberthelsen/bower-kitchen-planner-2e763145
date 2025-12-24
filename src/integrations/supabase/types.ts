export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      client_markup_settings: {
        Row: {
          client_id: string | null
          created_at: string | null
          delivery_markup: number | null
          door_drawer_markup: number | null
          edge_markup: number | null
          hardware_markup: number | null
          id: string
          is_default: boolean | null
          labor_markup: number | null
          markup_type: string | null
          material_markup: number | null
          name: string
          parts_markup: number | null
          stone_markup: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          delivery_markup?: number | null
          door_drawer_markup?: number | null
          edge_markup?: number | null
          hardware_markup?: number | null
          id?: string
          is_default?: boolean | null
          labor_markup?: number | null
          markup_type?: string | null
          material_markup?: number | null
          name: string
          parts_markup?: number | null
          stone_markup?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          delivery_markup?: number | null
          door_drawer_markup?: number | null
          edge_markup?: number | null
          hardware_markup?: number | null
          id?: string
          is_default?: boolean | null
          labor_markup?: number | null
          markup_type?: string | null
          material_markup?: number | null
          name?: string
          parts_markup?: number | null
          stone_markup?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_markup_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      door_drawer_pricing: {
        Row: {
          advanced: boolean | null
          area_assembly_cost: number | null
          area_handling_cost: number | null
          area_machining_cost: number | null
          assembly_cost: number | null
          created_at: string | null
          filter_name: string | null
          handling_cost: number | null
          id: string
          item_code: string
          machining_cost: number | null
          name: string
          outsourced: boolean | null
          suffix: string | null
          unit_cost: number | null
          updated_at: string | null
          visibility_status: string | null
        }
        Insert: {
          advanced?: boolean | null
          area_assembly_cost?: number | null
          area_handling_cost?: number | null
          area_machining_cost?: number | null
          assembly_cost?: number | null
          created_at?: string | null
          filter_name?: string | null
          handling_cost?: number | null
          id?: string
          item_code: string
          machining_cost?: number | null
          name: string
          outsourced?: boolean | null
          suffix?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Update: {
          advanced?: boolean | null
          area_assembly_cost?: number | null
          area_handling_cost?: number | null
          area_machining_cost?: number | null
          assembly_cost?: number | null
          created_at?: string | null
          filter_name?: string | null
          handling_cost?: number | null
          id?: string
          item_code?: string
          machining_cost?: number | null
          name?: string
          outsourced?: boolean | null
          suffix?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Relationships: []
      }
      edge_pricing: {
        Row: {
          application_cost: number | null
          area_handling_cost: number | null
          brand: string | null
          created_at: string | null
          door_filter: string | null
          edge_type: string | null
          finish: string | null
          handling_cost: number | null
          id: string
          item_code: string
          length_cost: number | null
          name: string
          thickness: number | null
          updated_at: string | null
          visibility_status: string | null
        }
        Insert: {
          application_cost?: number | null
          area_handling_cost?: number | null
          brand?: string | null
          created_at?: string | null
          door_filter?: string | null
          edge_type?: string | null
          finish?: string | null
          handling_cost?: number | null
          id?: string
          item_code: string
          length_cost?: number | null
          name: string
          thickness?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Update: {
          application_cost?: number | null
          area_handling_cost?: number | null
          brand?: string | null
          created_at?: string | null
          door_filter?: string | null
          edge_type?: string | null
          finish?: string | null
          handling_cost?: number | null
          id?: string
          item_code?: string
          length_cost?: number | null
          name?: string
          thickness?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Relationships: []
      }
      hardware_pricing: {
        Row: {
          assembly_cost: number | null
          brand: string | null
          created_at: string | null
          handling_cost: number | null
          hardware_type: string | null
          id: string
          inner_unit_cost: number | null
          item_code: string
          machining_cost: number | null
          name: string
          runner_depth: number | null
          runner_desc: string | null
          runner_height: number | null
          series: string | null
          unit_cost: number | null
          updated_at: string | null
          visibility_status: string | null
        }
        Insert: {
          assembly_cost?: number | null
          brand?: string | null
          created_at?: string | null
          handling_cost?: number | null
          hardware_type?: string | null
          id?: string
          inner_unit_cost?: number | null
          item_code: string
          machining_cost?: number | null
          name: string
          runner_depth?: number | null
          runner_desc?: string | null
          runner_height?: number | null
          series?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Update: {
          assembly_cost?: number | null
          brand?: string | null
          created_at?: string | null
          handling_cost?: number | null
          hardware_type?: string | null
          id?: string
          inner_unit_cost?: number | null
          item_code?: string
          machining_cost?: number | null
          name?: string
          runner_depth?: number | null
          runner_desc?: string | null
          runner_height?: number | null
          series?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          completion_date: string | null
          cost_excl_tax: number | null
          cost_incl_tax: number | null
          created_at: string | null
          customer_id: string | null
          delivery_method: string | null
          design_data: Json | null
          id: string
          job_number: number
          name: string
          notes: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completion_date?: string | null
          cost_excl_tax?: number | null
          cost_incl_tax?: number | null
          created_at?: string | null
          customer_id?: string | null
          delivery_method?: string | null
          design_data?: Json | null
          id?: string
          job_number?: number
          name: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completion_date?: string | null
          cost_excl_tax?: number | null
          cost_incl_tax?: number | null
          created_at?: string | null
          customer_id?: string | null
          delivery_method?: string | null
          design_data?: Json | null
          id?: string
          job_number?: number
          name?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_rates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          rate: number | null
          rate_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      material_pricing: {
        Row: {
          area_assembly_cost: number | null
          area_cost: number | null
          area_handling_cost: number | null
          brand: string | null
          created_at: string | null
          door_filter: string | null
          double_sided: boolean | null
          double_sided_cost: number | null
          expected_yield_factor: number | null
          finish: string | null
          horizontal_grain: boolean | null
          horizontal_grain_surcharge: number | null
          id: string
          item_code: string
          material_type: string | null
          minimum_job_area: number | null
          minimum_usage_rollover: number | null
          name: string
          prefix: string | null
          sheet_length: number | null
          sheet_width: number | null
          substrate: string | null
          thickness: number | null
          updated_at: string | null
          visibility_status: string | null
        }
        Insert: {
          area_assembly_cost?: number | null
          area_cost?: number | null
          area_handling_cost?: number | null
          brand?: string | null
          created_at?: string | null
          door_filter?: string | null
          double_sided?: boolean | null
          double_sided_cost?: number | null
          expected_yield_factor?: number | null
          finish?: string | null
          horizontal_grain?: boolean | null
          horizontal_grain_surcharge?: number | null
          id?: string
          item_code: string
          material_type?: string | null
          minimum_job_area?: number | null
          minimum_usage_rollover?: number | null
          name: string
          prefix?: string | null
          sheet_length?: number | null
          sheet_width?: number | null
          substrate?: string | null
          thickness?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Update: {
          area_assembly_cost?: number | null
          area_cost?: number | null
          area_handling_cost?: number | null
          brand?: string | null
          created_at?: string | null
          door_filter?: string | null
          double_sided?: boolean | null
          double_sided_cost?: number | null
          expected_yield_factor?: number | null
          finish?: string | null
          horizontal_grain?: boolean | null
          horizontal_grain_surcharge?: number | null
          id?: string
          item_code?: string
          material_type?: string | null
          minimum_job_area?: number | null
          minimum_usage_rollover?: number | null
          name?: string
          prefix?: string | null
          sheet_length?: number | null
          sheet_width?: number | null
          substrate?: string | null
          thickness?: number | null
          updated_at?: string | null
          visibility_status?: string | null
        }
        Relationships: []
      }
      parts_pricing: {
        Row: {
          area_assembly_cost: number | null
          area_handling_cost: number | null
          area_machining_cost: number | null
          assembly_cost: number | null
          created_at: string | null
          edging: string | null
          handling_cost: number | null
          id: string
          length_function: string | null
          machining_cost: number | null
          name: string
          part_type: string
          updated_at: string | null
          visibility_status: string | null
          width_function: string | null
        }
        Insert: {
          area_assembly_cost?: number | null
          area_handling_cost?: number | null
          area_machining_cost?: number | null
          assembly_cost?: number | null
          created_at?: string | null
          edging?: string | null
          handling_cost?: number | null
          id?: string
          length_function?: string | null
          machining_cost?: number | null
          name: string
          part_type: string
          updated_at?: string | null
          visibility_status?: string | null
          width_function?: string | null
        }
        Update: {
          area_assembly_cost?: number | null
          area_handling_cost?: number | null
          area_machining_cost?: number | null
          assembly_cost?: number | null
          created_at?: string | null
          edging?: string | null
          handling_cost?: number | null
          id?: string
          length_function?: string | null
          machining_cost?: number | null
          name?: string
          part_type?: string
          updated_at?: string | null
          visibility_status?: string | null
          width_function?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_price: number | null
          old_price: number | null
          product_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_price?: number | null
          old_price?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string | null
          default_depth: number | null
          default_height: number | null
          default_width: number | null
          id: string
          item_type: string | null
          name: string
          price: number
          sku: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_depth?: number | null
          default_height?: number | null
          default_width?: number | null
          id: string
          item_type?: string | null
          name: string
          price?: number
          sku: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_depth?: number | null
          default_height?: number | null
          default_width?: number | null
          id?: string
          item_type?: string | null
          name?: string
          price?: number
          sku?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string | null
          user_type: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string | null
          user_type?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
      stone_pricing: {
        Row: {
          brand: string
          created_at: string | null
          id: string
          install_supply_per_sqm: number | null
          range_tier: string | null
          trade_supply_per_sqm: number | null
          updated_at: string | null
        }
        Insert: {
          brand: string
          created_at?: string | null
          id?: string
          install_supply_per_sqm?: number | null
          range_tier?: string | null
          trade_supply_per_sqm?: number | null
          updated_at?: string | null
        }
        Update: {
          brand?: string
          created_at?: string | null
          id?: string
          install_supply_per_sqm?: number | null
          range_tier?: string | null
          trade_supply_per_sqm?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
