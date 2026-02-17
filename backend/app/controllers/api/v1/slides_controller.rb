module Api
  module V1
    class SlidesController < ApplicationController
      def index
        render json: { slides: fetch_slides }
      end

      private

      def fetch_slides
        connection = ActiveRecord::Base.connection

        begin
          result = connection.exec_query('SELECT slideid, slide_name FROM "Slides" ORDER BY slideid')
        rescue ActiveRecord::StatementInvalid
          result = connection.exec_query('SELECT slideid, slide_name FROM slides ORDER BY slideid')
        end

        result.to_a
      end
    end
  end
end
