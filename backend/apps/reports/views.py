from rest_framework.views import APIView
from rest_framework.response import Response


class ReportGenerateView(APIView):
    def post(self, request):
        return Response({"message": "Report generation queued", "status": "pending"})
